/*
 * One-way import of the legacy console store (localStorage key "fti.console.v2",
 * legacy/console-store.jsx:6) into a v3 AppState.
 *
 * The `legacy/` tree was deleted in commit 1311f84. Every legacy citation in this file is kept
 * because it documents where the rule came from; the files themselves are one command away,
 * for example `git show 1311f84^:legacy/console-store.jsx`.
 *
 * The function is pure: it reads no storage, writes no storage, and touches no React. The
 * caller supplies the one fact the legacy store never recorded, which unit the loads were
 * typed in (master plan section 9: "whether the user's own historical logs were entered in
 * kg or lb: asked once during P7's migration"). The old app had no unit system at all, only
 * field names and display strings: legacy/console-store.jsx labels the set weight "kg" in
 * every comment and coach line, so a user who typed pounds into it left no trace.
 *
 * Body mass is NOT part of that prompt. The legacy field is literally named `lb`
 * (legacy/console-store.jsx:92, `weightLog: [{ wk, lb, ts }]`), its input carried the
 * placeholder "lb" and was gated to 100..300 (legacy/console-today-extras.jsx:147), it was
 * displayed as "lb", and the legacy text export converted it to kg by dividing by 2.20462
 * (legacy/console-views.jsx:644). It is therefore pounds by construction, not by choice.
 * `bodyMassUnits` exists so a caller who knows otherwise can say so; it defaults to 'lb'.
 *
 * Nothing is dropped silently. Every record the migration refuses is appended to
 * `report.setsSkipped` with an origin-prefixed key (`sets.`, `weightLog[`, `water.`,
 * `notes.`, `pushupLog.`, `completed.`, `customEx.`, `specimens.`, `mealSwaps.`) and a
 * reason in plain language. Every legacy day whose sets could not be attached to a session
 * of the new plan is appended to `report.sessionFallbacks` with the reason. The wizard
 * shows both lists; the user keeps the untouched legacy JSON either way.
 */

import { instantOf, isValidLocalDate, isValidTimeZone, daysBetween, localDateOf } from '../dates';
import { newId } from '../ids';
import { ACCESS_UNLOCKS } from '../types';
import { CURRENT_SCHEMA_VERSION, MAX_EPOCH_MS, parseState } from '../schema';
import type {
  AppState,
  BodyMassEntry,
  EpochMs,
  Exercise,
  HydrationEntry,
  Kg,
  LocalDate,
  LoggedSet,
  PlanTemplate,
  Profile,
  TimeCapsule,
  TimeZone,
  UnitSystem,
} from '../types';
import { toStoredLoad, toStoredMass } from '../units';
import {
  LEGACY_DAYS_PER_WEEK,
  LEGACY_SESSION_ID,
  LEGACY_WEEKS,
  UNMAPPED,
  V2_DAY_LABEL,
  legacyDateOf,
  legacyDay,
  legacyExerciseIdAt,
  legacyIdForName,
  legacySlot,
  legacyTargetSets,
} from './v2plan';

/**
 * The unit the user names at the migration prompt. It is deliberately 'kg' | 'lb' and not
 * UnitSystem: the question asked is about a unit of mass that was typed into one box years
 * ago, not about a measurement system the legacy app never had.
 */
export type LegacyUnit = 'kg' | 'lb';

export interface MigrateV2Options {
  /** The unit the user says the legacy set-log weight box was typed in. */
  units: LegacyUnit;
  /**
   * The unit the legacy body-mass field held. Defaults to 'lb', which is what the field name,
   * its placeholder, its 100..300 gate and the legacy export all say it was.
   */
  bodyMassUnits?: LegacyUnit;
  /** IANA zone used to place a legacy date on the time line. */
  timezone: TimeZone;
  profile: Profile;
  plan: PlanTemplate;
}

export interface MigrationSkip {
  /** Origin-prefixed identifier of the refused record. */
  key: string;
  reason: string;
}

export interface MigrationReport {
  /** LoggedSet records written, including weekly push-up maxima. [sets] */
  setsMigrated: number;
  /**
   * Distinct (assignment date, session) pairs the migrated sets fall into: the number of
   * training sessions the import reconstructs. [sessions]
   */
  sessionsMigrated: number;
  /** Every refused record, whatever its origin. */
  setsSkipped: MigrationSkip[];
  /** Legacy days whose sets could not be attached to a session of the new plan. */
  sessionFallbacks: MigrationSkip[];
  bodyMassMigrated: number;
  /** Days with a non-zero hydration volume. [d] */
  hydrationDays: number;
  notesKept: number;
  /** The units the migration assumed, echoed back so the wizard can show them. */
  unitsAssumed: { loads: LegacyUnit; bodyMass: LegacyUnit };
}

export type MigrateV2Result =
  | { ok: true; state: AppState; report: MigrationReport }
  | { ok: false; reason: string };

export type ApplyMigrationResult =
  /** `skipped` holds the migrated sets the target state already had. */
  | { ok: true; state: AppState; skipped: MigrationSkip[] }
  | { ok: false; reason: string };

/** legacy/console-store.jsx:95, "waterTarget: 7, // 500 ml x 7 = 3.5 L". */
export const CUP_ML = 500; // [mL] per legacy cup

// ---------------------------------------------------------------------------
// Bounds. Each one is either schema.ts's own ceiling (so a migrated record is
// accepted by AppStateSchema by construction) or a legacy-side limit.
// ---------------------------------------------------------------------------

const MAX_LOAD_KG = 500; // [kg] schema.ts KgLoad ceiling; security review constraint 3
const MIN_REPS = 1; // [reps]
const MAX_REPS = 100; // [reps] schema.ts ceiling
const MIN_BODY_MASS_KG = 20; // [kg] below any living adult; schema.ts requires > 0
const MAX_BODY_MASS_KG = 400; // [kg] under schema.ts's 500 kg ceiling
const MAX_CUPS = 24; // [cups/day] the legacy waterTarget slider was bounded 1..24
const MAX_NOTE_CHARS = 5_000; // [characters] schema.ts MAX_NOTE_CHARS
const MAX_EXERCISE_NAME_CHARS = 120; // [characters] schema.ts ExerciseSchema.name ceiling
const MAX_SET_NUMBER = 20; // [sets] schema.ts MAX_SETS; a higher ordinal cannot be stored
const MAX_PUSHUPS = 100; // [reps] a push-up maximum is stored as a set, so it obeys MAX_REPS
const CUSTOM_EX_BASE = 1000; // legacy/console-train.jsx:391
/**
 * A legacy specimen card id: one lower-case letter then three digits. Every id in
 * legacy/console-content.js:564-711 has this shape (`c001`..`c015`, `u001`..`u015`,
 * `r001`..`r012`), and the v3 catalogue in src/content/specimenCards.ts keeps it. The gate
 * is on the SHAPE, not on membership of the v3 catalogue: a card the content review
 * dropped is still a card the user collected, and refusing it would delete their record.
 */
const CARD_ID_RE = /^[a-z]\d{3}$/;

/** Reason text reused by every date-derived record when the legacy start date is missing. */
const NO_START =
  'the legacy store records no start date, so (week, day) cannot be resolved to a calendar date';

// ---------------------------------------------------------------------------
// Narrowing helpers. No `as`, no `any`.
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Array.isArray narrows `unknown` to `any[]`, which reintroduces `any` into every element
 * read. This narrows to `unknown[]` instead, so each element still has to be proved.
 */
function isUnknownArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

/** Finite numbers only: Number.isFinite(Infinity) is false, !isNaN(Infinity) is not (M6). */
function finiteNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** The unit system a LoggedSet or BodyMassEntry records as `enteredUnit`. */
function unitSystemOf(u: LegacyUnit): UnitSystem {
  return u === 'lb' ? 'imperial' : 'metric';
}

/** First whitespace-delimited word, lowercased. '' when there is none. */
function firstWord(label: string): string {
  return label.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

/** A legacy `customEx` key: `week-day` (legacy/console-train.jsx:391). */
const CUSTOM_DAY_KEY_RE = /^(\d+)-(\d+)$/;

/**
 * Order two legacy `customEx` keys by week then day, numerically.
 *
 * The keys are `week-day` strings, so the default Array.prototype.sort() compares them as
 * text and puts '10-1' before '2-1'. That order is load-bearing: the loop that reads these
 * blocks is first-encountered-wins (it writes customSetsSpec only when the name is absent
 * and returns as soon as customByName holds it), so a string sort lets week 10 define an
 * exercise that week 2 introduced, and it fixes the order the exercises are stored in.
 *
 * A key that is not `week-day` sorts after every key that is, and ties between two such keys
 * are broken by code-point order, so the result is a total order and the pass stays
 * deterministic whatever the legacy blob holds. localeCompare is deliberately not used here:
 * its result depends on the runtime locale, and this order must not.
 */
function compareCustomDayKeys(a: string, b: string): number {
  const ma = CUSTOM_DAY_KEY_RE.exec(a);
  const mb = CUSTOM_DAY_KEY_RE.exec(b);
  if (ma === null || mb === null) {
    if (ma !== null) return -1;
    if (mb !== null) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const week = Number.parseInt(ma[1] ?? '', 10) - Number.parseInt(mb[1] ?? '', 10); // [weeks]
  if (week !== 0) return week;
  return Number.parseInt(ma[2] ?? '', 10) - Number.parseInt(mb[2] ?? '', 10); // [d]
}

// ---------------------------------------------------------------------------
// Session matching
// ---------------------------------------------------------------------------

interface SessionMatch {
  sessionId: string;
  /** null when a session matched; otherwise why the set carries LEGACY_SESSION_ID. */
  fallbackReason: string | null;
}

/**
 * The session in `plan` that a legacy day belongs to.
 *
 * Rule: compare the FIRST WORD of the legacy day's label with the first word of each
 * session's label, case-insensitively, and take the lowest-indexed session that matches.
 * The first word is the discriminating one and the rest is a rotation marker that the
 * legacy app never had: src/domain/plan/templates.ts labels its sessions 'Push A', 'Pull A',
 * 'Legs A', 'Upper A', 'Lower A', so an exact-match rule would attach nothing at all. It is
 * still not fuzzy matching: a legacy 'Push' set is never relabelled 'Upper', because 'push'
 * and 'upper' are different words.
 *
 * The legacy conditioning day is matched on SessionKind instead, because no template fixes
 * the label of a conditioning session. src/domain/plan/generator.ts:296 writes
 * `kind: 'lift'` for every generated session, so a generated plan has no conditioning
 * session and this branch reports the fallback rather than guessing.
 *
 * Anything unmatched, the two rest days included, gets LEGACY_SESSION_ID, which is the
 * honest record that the set predates the current plan.
 */
function resolveSessionId(plan: PlanTemplate, day: number): SessionMatch {
  const legacy = legacyDay(day);
  if (legacy === null) {
    return {
      sessionId: LEGACY_SESSION_ID,
      fallbackReason: `legacy day ${day} is not one of the seven rotation days`,
    };
  }

  if (legacy.kind === 'cardio') {
    const cardio = plan.sessions.find((s) => s.kind === 'cardio');
    if (cardio !== undefined) return { sessionId: cardio.id, fallbackReason: null };
    return {
      sessionId: LEGACY_SESSION_ID,
      fallbackReason: 'no conditioning session in the generated plan',
    };
  }

  const label = V2_DAY_LABEL[day] ?? null;
  if (label === null) {
    return {
      sessionId: LEGACY_SESSION_ID,
      fallbackReason: `legacy day ${day} was a rest day and claims no session label`,
    };
  }

  const want = firstWord(label);
  const match = plan.sessions.find((s) => firstWord(s.label) === want);
  if (match !== undefined) return { sessionId: match.id, fallbackReason: null };
  return {
    sessionId: LEGACY_SESSION_ID,
    fallbackReason: `no session of the new plan is labelled "${want}", so the legacy "${label}" day has nowhere to attach`,
  };
}

// ---------------------------------------------------------------------------

/** A valid, empty v3 state carrying only the profile and plan the caller supplied. */
function blankState(profile: Profile, plan: PlanTemplate): AppState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeProfileId: profile.id,
    profiles: { [profile.id]: profile },
    availability: {},
    plans: { [plan.id]: plan },
    cursors: {},
    pauses: {},
    assignments: {},
    sets: {},
    bodyMass: {},
    hydration: {},
    intake: {},
    weeklyReviews: {},
    reminderSettings: {},
    pushDevice: null,
    motivation: {},
    specimens: {},
    capsules: {},
    customExercises: {},
    notes: {},
    // Additive (C1.G.1): a v2 document has no in-progress P1 wizard to resume.
    setupDraft: null,
    ui: {
      bootSeen: true,
      // Additive, same rule as bootSeen above: a v2 document is an existing user who has
      // already met the app, so the intro sequence (src/ui/intro/IntroSequence.tsx) is not
      // shown to them either.
      introSeen: true,
      lastView: 'today',
      accent: '#a3e635',
      scanlines: true,
      flicker: false,
      density: 'normal',
      videoInstanceHost: null,
      legacyMigration: 'pending',
      lastBlockSeenByProfile: {},
      // P8 Task 12. Additive, so this literal only has to name them because it is a whole
      // UiPrefs rather than a patch; the values are defaultState()'s own.
      skin: 'limelight',
      sounds: false,
      // Additive, same rule: a migrated document has announced no milestone.
      milestoneFloorByProfile: {},
      // Additive, same rule again: a migrated document has never switched the keyboard
      // shortcuts off, and true is the state every document before the switch was in.
      hotkeys: true,
    },
  };
}

export function migrateV2(raw: unknown, opts: MigrateV2Options): MigrateV2Result {
  const { profile, plan, timezone, units } = opts;
  const bodyMassUnits: LegacyUnit = opts.bodyMassUnits ?? 'lb';
  const loadUnitSystem = unitSystemOf(units);
  const massUnitSystem = unitSystemOf(bodyMassUnits);
  const profileId = profile.id;

  // dates.ts throws a RangeError on an unknown zone, and this function must never throw.
  // `timezone` narrows to never in the false branch, so the text is read before the check.
  const timezoneText: string = timezone;
  if (!isValidTimeZone(timezone)) {
    return { ok: false, reason: `"${timezoneText}" is not an IANA time zone` };
  }
  if (!isRecord(raw)) {
    return { ok: false, reason: 'the legacy payload is not a JSON object' };
  }

  const skipped: MigrationSkip[] = [];
  const fallbacks = new Map<string, string>();
  const state = blankState(profile, plan);

  const startRaw = str(raw['startDate']);
  const startDate: LocalDate | null =
    startRaw !== null && isValidLocalDate(startRaw) ? startRaw : null;

  /** Noon avoids every DST gap, so this never throws and never lands on the wrong day. */
  const noonOf = (date: LocalDate): EpochMs => instantOf(date, '12:00', timezone); // [ms]

  /** A legacy `ts`, accepted only when it is a storable epoch instant. [ms] */
  const epochOr = (v: unknown, fallback: EpochMs): EpochMs => {
    const n = finiteNum(v);
    if (n === null || !Number.isInteger(n) || Math.abs(n) > MAX_EPOCH_MS) return fallback;
    return n;
  };

  /** Records a session fallback once per legacy day. */
  const sessionOf = (day: number): string => {
    const match = resolveSessionId(plan, day);
    if (match.fallbackReason !== null) fallbacks.set(`day.${day}`, match.fallbackReason);
    return match.sessionId;
  };

  // ---- custom exercises first: the set loop needs their ids -----------------
  const customByName = new Map<string, Exercise>();
  const customSetsSpec = new Map<string, string>();
  const customList: Exercise[] = [];
  const customRaw = isRecord(raw['customEx']) ? raw['customEx'] : {};
  for (const dayKey of Object.keys(customRaw).sort(compareCustomDayKeys)) {
    const list = customRaw[dayKey];
    if (!isUnknownArray(list)) {
      skipped.push({ key: `customEx.${dayKey}`, reason: 'not an array of exercises' });
      continue;
    }
    list.forEach((entry: unknown, i: number) => {
      const where = `customEx.${dayKey}[${i}]`;
      if (!isRecord(entry)) {
        skipped.push({ key: where, reason: 'not an object' });
        return;
      }
      const name = (str(entry['name']) ?? '').trim();
      if (name === '') {
        skipped.push({ key: where, reason: 'the custom exercise has no name' });
        return;
      }
      if (name.length > MAX_EXERCISE_NAME_CHARS) {
        skipped.push({
          key: where,
          reason: `the custom exercise name is longer than ${MAX_EXERCISE_NAME_CHARS} characters`,
        });
        return;
      }
      const norm = name.toLowerCase();
      if (!customSetsSpec.has(norm)) customSetsSpec.set(norm, str(entry['sets']) ?? '3');
      if (customByName.has(norm)) return; // the same exercise re-added on another day
      const ex: Exercise = {
        id: newId(),
        name,
        isBodyweight: false,
        isCompoundPrimary: false,
        modality: 'dumbbell',
        loadClass: 'isolation',
        muscleGroups: [],
        secondaryMuscles: [],
        // profile.equipment is now an EquipmentAccess (what the user HAS), not an Equipment (what
        // an exercise NEEDS): tag the imported custom exercise with every tier that access level
        // unlocks, per src/domain/types.ts ACCESS_UNLOCKS.
        equipment: [...ACCESS_UNLOCKS[profile.equipment]],
        videoQuery: name,
        formCueId: null,
        note:
          'Imported from the v2 console. The old app recorded no modality and no load class, ' +
          'so this defaults to dumbbell / isolation, which takes the smaller 2.5 % progression ' +
          'increment. Correct it in Settings if that is wrong.',
      };
      customByName.set(norm, ex);
      customList.push(ex);
    });
  }
  if (customList.length > 0) state.customExercises[profileId] = customList;

  // ---- sets -----------------------------------------------------------------
  const setsRaw = isRecord(raw['sets']) ? raw['sets'] : {};
  const KEY_RE = /^(\d+)-(\d+)-(\d+)-(\d+)$/;
  /** `${date}|${exerciseId}` -> highest setNumber written, so push-up maxima append after. */
  const highestSetNumber = new Map<string, number>();
  /** `${week}-${day}-${exIdx}` seen with at least one migrated set, for the `completed` pass. */
  const slotsWithSets = new Set<string>();
  /** `${date}|${sessionId}` for the report's session count. */
  const sessionsSeen = new Set<string>();

  for (const key of Object.keys(setsRaw).sort()) {
    const where = `sets.${key}`;
    const m = KEY_RE.exec(key);
    if (m === null) {
      skipped.push({ key: where, reason: 'the key is not `week-day-exIdx-setNumber`' });
      continue;
    }
    const week = Number.parseInt(m[1] ?? '', 10);
    const day = Number.parseInt(m[2] ?? '', 10);
    const exIdx = Number.parseInt(m[3] ?? '', 10);
    const setNumber = Number.parseInt(m[4] ?? '', 10);

    if (week < 1 || week > LEGACY_WEEKS) {
      skipped.push({
        key: where,
        reason: `week ${week} is outside the legacy range 1..${LEGACY_WEEKS}`,
      });
      continue;
    }
    if (day < 1 || day > LEGACY_DAYS_PER_WEEK) {
      skipped.push({
        key: where,
        reason: `day ${day} is outside the legacy range 1..${LEGACY_DAYS_PER_WEEK}`,
      });
      continue;
    }
    if (setNumber < 1 || setNumber > MAX_SET_NUMBER) {
      skipped.push({
        key: where,
        reason: `set number ${setNumber} is outside 1..${MAX_SET_NUMBER}`,
      });
      continue;
    }

    const payload = setsRaw[key];
    if (!isRecord(payload)) {
      skipped.push({ key: where, reason: 'the set record is not an object' });
      continue;
    }

    // exercise identity
    let exerciseId: string;
    let expectedName: string;
    if (exIdx >= CUSTOM_EX_BASE) {
      const i = exIdx - CUSTOM_EX_BASE;
      const defs = customRaw[`${week}-${day}`];
      const def: unknown = isUnknownArray(defs) ? defs[i] : undefined;
      const name = isRecord(def) ? (str(def['name']) ?? '').trim() : '';
      const ex = name === '' ? undefined : customByName.get(name.toLowerCase());
      if (ex === undefined) {
        skipped.push({
          key: where,
          reason: `no custom exercise is defined at index ${i} of ${week}-${day}`,
        });
        continue;
      }
      exerciseId = ex.id;
      expectedName = ex.name;
    } else {
      const slot = legacySlot(day, exIdx);
      if (slot === null) {
        skipped.push({ key: where, reason: `day ${day} has no exercise slot ${exIdx}` });
        continue;
      }
      expectedName = slot.legacyName;
      const resolved = legacyExerciseIdAt(day, exIdx, week);
      if (resolved === null) {
        // v2plan.ts's UNMAPPED table is the frozen record of WHY a legacy row has no
        // library id. Quoting it here is what makes the drop auditable.
        const documented = UNMAPPED[slot.legacyName];
        const because = documented === undefined ? '' : `: ${documented}`;
        skipped.push({
          key: where,
          reason: `"${slot.legacyName}" has no equivalent in the exercise library${because}`,
        });
        continue;
      }
      exerciseId = resolved;
    }

    // The payload carries a frozen copy of the display name. Disagreement means the record is
    // internally inconsistent, so refuse it rather than guess which half is right.
    const recordedName = str(payload['exName']);
    if (recordedName !== null && recordedName.trim() !== expectedName) {
      skipped.push({
        key: where,
        reason: `the key resolves to "${expectedName}" but the record does not match it ("${recordedName.trim()}")`,
      });
      continue;
    }

    // load
    let loadKg: Kg | null = null;
    const rawWeight = payload['weight'];
    if (rawWeight !== undefined && rawWeight !== null) {
      const w = finiteNum(rawWeight); // [kg] or [lb] per opts.units
      if (w === null) {
        skipped.push({ key: where, reason: 'the logged load is not a finite number' });
        continue;
      }
      if (w < 0) {
        skipped.push({ key: where, reason: `the logged load is negative (${w})` });
        continue;
      }
      const kg = toStoredLoad(w, loadUnitSystem); // [kg] exact, no rounding at storage
      if (kg > MAX_LOAD_KG) {
        skipped.push({
          key: where,
          reason: `the logged load is ${kg.toFixed(1)} kg, above the ${MAX_LOAD_KG} kg bound`,
        });
        continue;
      }
      loadKg = kg; // [kg] canonical
    }

    // reps
    let reps: number | null = null;
    const rawReps = payload['reps'];
    if (rawReps !== undefined && rawReps !== null) {
      const r = finiteNum(rawReps); // [reps]
      if (r === null || !Number.isInteger(r) || r < MIN_REPS || r > MAX_REPS) {
        skipped.push({
          key: where,
          reason: `reps must be a whole number in ${MIN_REPS}..${MAX_REPS}`,
        });
        continue;
      }
      reps = r;
    }

    if (loadKg === null && reps === null) {
      skipped.push({ key: where, reason: 'the record holds neither a load nor a rep count' });
      continue;
    }

    if (startDate === null) {
      skipped.push({ key: where, reason: NO_START });
      continue;
    }
    const assignmentDate = legacyDateOf(startDate, week, day);

    const setsSpec =
      exIdx >= CUSTOM_EX_BASE
        ? (customSetsSpec.get(expectedName.toLowerCase()) ?? '3')
        : (legacySlot(day, exIdx)?.setsSpec ?? '3');
    const parsedSpec = Number.parseInt(setsSpec, 10); // [sets]
    const target =
      exIdx >= CUSTOM_EX_BASE
        ? Number.isFinite(parsedSpec)
          ? parsedSpec
          : 3
        : legacyTargetSets(setsSpec, week); // [sets] prescribed for this week

    const id = newId();
    const sessionId = sessionOf(day);
    state.sets[id] = {
      id,
      profileId,
      assignmentDate,
      sessionId,
      exerciseId,
      setNumber, // [sets] 1-based ordinal
      isBonus: setNumber > target,
      loadKg, // [kg]
      enteredUnit: loadUnitSystem,
      reps, // [reps]
      durationS: null, // [s] the legacy set row had no duration field
      rpe: null, // the legacy set row had no RPE field
      loggedAt: epochOr(payload['ts'], noonOf(assignmentDate)), // [ms]
    };
    slotsWithSets.add(`${week}-${day}-${exIdx}`);
    sessionsSeen.add(`${assignmentDate}|${sessionId}`);
    const seenKey = `${assignmentDate}|${exerciseId}`;
    highestSetNumber.set(seenKey, Math.max(highestSetNumber.get(seenKey) ?? 0, setNumber));
  }

  // ---- weekly push-up maxima -------------------------------------------------
  // `pushupLog[wk]` is one number per legacy week. Its meaning was never settled in the old
  // app (code review A64: documented as a weekly maximum, incremented daily by the +1/+5
  // buttons of legacy/console-today-extras.jsx:183-185), so it is imported as one AMRAP set
  // on legacy day 4, the only day whose exercise list contains push-ups, appended after any
  // set already logged there.
  const pushupRaw = isRecord(raw['pushupLog']) ? raw['pushupLog'] : {};
  const PUSHUP_DAY = 4;
  for (const wkKey of Object.keys(pushupRaw).sort((a, b) => Number(a) - Number(b))) {
    const where = `pushupLog.${wkKey}`;
    const week = Number.parseInt(wkKey, 10);
    const n = finiteNum(pushupRaw[wkKey]); // [reps]
    if (!Number.isInteger(week) || week < 1 || week > LEGACY_WEEKS) {
      skipped.push({
        key: where,
        reason: `week ${wkKey} is outside the legacy range 1..${LEGACY_WEEKS}`,
      });
      continue;
    }
    if (n === null || !Number.isInteger(n) || n < 1 || n > MAX_PUSHUPS) {
      skipped.push({
        key: where,
        reason: `the maximum must be a whole number in 1..${MAX_PUSHUPS}`,
      });
      continue;
    }
    const exerciseId = legacyExerciseIdAt(PUSHUP_DAY, 0, week);
    if (exerciseId === null) {
      skipped.push({
        key: where,
        reason: 'the push-up slot has no equivalent in the exercise library',
      });
      continue;
    }
    if (startDate === null) {
      skipped.push({ key: where, reason: NO_START });
      continue;
    }
    const assignmentDate = legacyDateOf(startDate, week, PUSHUP_DAY);
    const seenKey = `${assignmentDate}|${exerciseId}`;
    const setNumber = (highestSetNumber.get(seenKey) ?? 0) + 1; // [sets]
    if (setNumber > MAX_SET_NUMBER) {
      skipped.push({
        key: where,
        reason: `appending it would need set number ${setNumber}, above the ${MAX_SET_NUMBER} the store accepts`,
      });
      continue;
    }
    highestSetNumber.set(seenKey, setNumber);
    const id = newId();
    const sessionId = sessionOf(PUSHUP_DAY);
    state.sets[id] = {
      id,
      profileId,
      assignmentDate,
      sessionId,
      exerciseId,
      setNumber, // [sets]
      isBonus: true, // a weekly test, not a prescribed set
      loadKg: 0, // [kg] bodyweight
      enteredUnit: loadUnitSystem,
      reps: n, // [reps]
      durationS: null, // [s]
      rpe: null,
      loggedAt: noonOf(assignmentDate), // [ms] the legacy counter carried no instant
    };
    sessionsSeen.add(`${assignmentDate}|${sessionId}`);
  }

  // ---- body mass -------------------------------------------------------------
  const massRaw = raw['weightLog'];
  const massEntries: BodyMassEntry[] = [];
  if (isUnknownArray(massRaw)) {
    massRaw.forEach((entry: unknown, i: number) => {
      const where = `weightLog[${i}]`;
      if (!isRecord(entry)) {
        skipped.push({ key: where, reason: 'not an object' });
        return;
      }
      const week = finiteNum(entry['wk']);
      const value = finiteNum(entry['lb']); // [lb] by default; see bodyMassUnits
      if (week === null || !Number.isInteger(week) || week < 1 || week > LEGACY_WEEKS) {
        skipped.push({
          key: where,
          reason: `week is not a whole number in 1..${LEGACY_WEEKS}`,
        });
        return;
      }
      if (value === null) {
        skipped.push({ key: where, reason: 'the recorded body mass is not a finite number' });
        return;
      }
      const massKg = toStoredMass(value, massUnitSystem); // [kg] exact
      if (massKg < MIN_BODY_MASS_KG || massKg > MAX_BODY_MASS_KG) {
        skipped.push({
          key: where,
          reason: `${massKg.toFixed(1)} kg is outside the plausible range ${MIN_BODY_MASS_KG}..${MAX_BODY_MASS_KG} kg`,
        });
        return;
      }
      if (startDate === null) {
        skipped.push({ key: where, reason: NO_START });
        return;
      }
      const date = legacyDateOf(startDate, week, 1);
      massEntries.push({
        id: newId(),
        profileId,
        date,
        massKg, // [kg]
        enteredUnit: massUnitSystem,
        bodyFatPct: null, // [%] the legacy log had no body-fat field
        loggedAt: epochOr(entry['ts'], noonOf(date)), // [ms]
      });
    });
  } else if (massRaw !== undefined && massRaw !== null) {
    skipped.push({ key: 'weightLog', reason: 'not an array' });
  }
  massEntries.sort((a, b) => a.date.localeCompare(b.date));
  if (massEntries.length > 0) state.bodyMass[profileId] = massEntries;

  // ---- hydration -------------------------------------------------------------
  const waterRaw = isRecord(raw['water']) ? raw['water'] : {};
  const hydration: HydrationEntry[] = [];
  for (const date of Object.keys(waterRaw).sort()) {
    const where = `water.${date}`;
    if (!isValidLocalDate(date)) {
      skipped.push({ key: where, reason: 'the key is not a YYYY-MM-DD date' });
      continue;
    }
    const cups = finiteNum(waterRaw[date]); // [cups/day]
    if (cups === null || !Number.isInteger(cups) || cups < 0 || cups > MAX_CUPS) {
      skipped.push({
        key: where,
        reason: `the cup count must be a whole number in 0..${MAX_CUPS}`,
      });
      continue;
    }
    if (cups === 0) {
      skipped.push({ key: where, reason: 'zero cups recorded; there is no volume to migrate' });
      continue;
    }
    hydration.push({
      profileId,
      date,
      volumeML: cups * CUP_ML, // [mL]
      marks: [], // [ms] the legacy store kept a count, never the instants
    });
  }
  if (hydration.length > 0) state.hydration[profileId] = hydration;

  // ---- notes -----------------------------------------------------------------
  const notesRaw = isRecord(raw['notes']) ? raw['notes'] : {};
  // Null prototype: `notes[date] = ...` is a write by legacy-supplied key. isValidLocalDate
  // already rejects "__proto__", so this is defence in depth, not a live fix.
  const notes: Record<LocalDate, string> = Object.create(null) as Record<LocalDate, string>;
  for (const date of Object.keys(notesRaw).sort()) {
    const where = `notes.${date}`;
    if (!isValidLocalDate(date)) {
      skipped.push({ key: where, reason: 'the key is not a YYYY-MM-DD date' });
      continue;
    }
    const text = str(notesRaw[date]);
    if (text === null) {
      skipped.push({ key: where, reason: 'the note is not text' });
      continue;
    }
    const trimmed = text.trim();
    if (trimmed === '') {
      skipped.push({ key: where, reason: 'the note is empty' });
      continue;
    }
    if (trimmed.length > MAX_NOTE_CHARS) {
      skipped.push({
        key: where,
        reason: `the note is longer than ${MAX_NOTE_CHARS} characters`,
      });
      continue;
    }
    notes[date] = trimmed;
  }
  if (Object.keys(notes).length > 0) state.notes[profileId] = notes;

  // ---- specimens -------------------------------------------------------------
  // The legacy specimen record froze a display name, not an id, and two legacy slots mean
  // different exercises in different weeks. The record's own `acquiredAt` fixes which week it
  // was, so the week is recovered from it and the id in force then is the one stored.
  //
  // Two guards, because the keys come from the legacy blob. `acquired` has a null
  // prototype: on a plain object `acquired['__proto__'] = rec` reaches Object.prototype's
  // __proto__ setter, which stores nothing and leaves no entry in setsSkipped, breaking
  // this module's one promise. CARD_ID_RE then refuses every key that is not a card id --
  // "constructor" among them -- with a reason, so nothing is dropped silently either.
  const specRaw = isRecord(raw['specimens']) ? raw['specimens'] : {};
  const acquired: Record<string, { at: EpochMs; exerciseId: string | null }> = Object.create(
    null,
  ) as Record<string, { at: EpochMs; exerciseId: string | null }>;
  for (const cardId of Object.keys(specRaw).sort()) {
    if (!CARD_ID_RE.test(cardId)) {
      skipped.push({
        key: `specimens.${cardId}`,
        reason:
          `"${cardId}" is not a legacy card id (one lower-case letter then three digits), ` +
          'so there is no card for it to unlock',
      });
      continue;
    }
    const rec = specRaw[cardId];
    if (!isRecord(rec)) {
      skipped.push({ key: `specimens.${cardId}`, reason: 'not an object' });
      continue;
    }
    const at = epochOr(rec['acquiredAt'], profile.createdAt); // [ms]
    const exName = str(rec['exercise']);
    let exerciseId: string | null = null;
    if (exName !== null) {
      const week = startDate === null ? null : legacyWeekOf(at, startDate, timezone);
      exerciseId = week === null ? legacyIdForName(exName) : legacyIdForName(exName, week);
    }
    acquired[cardId] = { at, exerciseId };
  }
  state.specimens[profileId] = {
    profileId,
    acquired,
    // Recomputed, not carried: the legacy counter only ever increased (code review A47).
    totalSetsLogged: Object.keys(state.sets).length, // [sets]
  };

  // ---- time capsule ----------------------------------------------------------
  const capsuleRaw = raw['timeCapsule'];
  if (isRecord(capsuleRaw)) {
    const note = str(capsuleRaw['note']);
    const writtenOn = str(capsuleRaw['writtenAt']);
    if (note === null || note.trim() === '') {
      skipped.push({ key: 'timeCapsule', reason: 'the capsule holds no text' });
    } else if (note.trim().length > MAX_NOTE_CHARS) {
      skipped.push({
        key: 'timeCapsule',
        reason: `the capsule text is longer than ${MAX_NOTE_CHARS} characters`,
      });
    } else if (writtenOn === null || !isValidLocalDate(writtenOn)) {
      skipped.push({ key: 'timeCapsule', reason: 'the capsule has no valid written-on date' });
    } else if (startDate === null) {
      skipped.push({ key: 'timeCapsule', reason: NO_START });
    } else {
      // The legacy capsule unlocked at programme week 24 (legacy/console-fun.jsx:313).
      const capsule: TimeCapsule = {
        note: note.trim(),
        writtenAt: noonOf(writtenOn), // [ms]
        opensOn: legacyDateOf(startDate, LEGACY_WEEKS, 1),
        opened: capsuleRaw['opened'] === true,
      };
      state.capsules[profileId] = capsule;
    }
  }

  // ---- records with no home in v3 -------------------------------------------
  // `completed[wk-day-exIdx]` marked a whole exercise done. v3 records completion on
  // SessionAssignment, which belongs to the new plan's calendar, so a legacy flag has
  // nowhere to go. It is reported only when no logged set already covers that exact slot;
  // otherwise nothing is lost and the report stays readable.
  const completedRaw = isRecord(raw['completed']) ? raw['completed'] : {};
  for (const key of Object.keys(completedRaw).sort()) {
    if (completedRaw[key] !== true) continue;
    if (slotsWithSets.has(key)) continue;
    skipped.push({
      key: `completed.${key}`,
      reason:
        'an exercise was marked complete with no logged set; v3 records completion per session, not per exercise',
    });
  }

  const swapsRaw = isRecord(raw['mealSwaps']) ? raw['mealSwaps'] : {};
  for (const i of Object.keys(swapsRaw).sort()) {
    const text = (str(swapsRaw[i]) ?? '').trim();
    if (text === '') continue;
    skipped.push({
      key: `mealSwaps.${i}`,
      reason:
        'the fixed meal plan these notes annotate is not part of v3; the text stays in the legacy JSON',
    });
  }
  const outNote = (str(raw['mealOutNote']) ?? '').trim();
  if (outNote !== '') {
    skipped.push({
      key: 'mealOutNote',
      reason:
        'the fixed meal plan this note annotates is not part of v3; the text stays in the legacy JSON',
    });
  }

  // Schema-valid by construction: the same validator the store uses on every load runs here,
  // so a migration that produced an unstorable document is a refusal, not a silent write.
  const parsed = parseState(state);
  if (!parsed.ok) {
    return { ok: false, reason: `the migrated document does not validate: ${parsed.error}` };
  }

  return {
    ok: true,
    state: parsed.state,
    report: {
      setsMigrated: Object.keys(parsed.state.sets).length, // [sets]
      sessionsMigrated: sessionsSeen.size, // [sessions]
      setsSkipped: skipped,
      sessionFallbacks: [...fallbacks.entries()].map(([key, reason]) => ({ key, reason })),
      bodyMassMigrated: (parsed.state.bodyMass[profileId] ?? []).length,
      hydrationDays: (parsed.state.hydration[profileId] ?? []).length, // [d]
      notesKept: Object.keys(parsed.state.notes[profileId] ?? {}).length,
      unitsAssumed: { loads: units, bodyMass: bodyMassUnits },
    },
  };
}

/**
 * The legacy programme week an instant falls in, using the legacy rule that day 1 of week 1
 * is the start date (legacy/console-store.jsx:68-77). Returns null when the instant lies
 * outside the 24-week programme, so the caller does not invent a week for it.
 */
function legacyWeekOf(at: EpochMs, startDate: LocalDate, tz: TimeZone): number | null {
  const dayIndex = daysBetween(startDate, localDateOf(at, tz)); // [d]
  if (dayIndex < 0) return null;
  const week = Math.floor(dayIndex / LEGACY_DAYS_PER_WEEK) + 1;
  return week > LEGACY_WEEKS ? null : week;
}

/**
 * Merge a migration result onto the state the setup wizard already produced.
 *
 * Only the slices the migration writes are touched, plus `ui.legacyMigration`, which becomes
 * "done" so the wizard does not offer itself again. The plan, cursor, availability and
 * reminder settings the user just configured are left exactly as they are. Where both sides
 * hold a value for the same day, the value entered in the new app wins.
 *
 * Sets are merged by identity, not by id. A LoggedSet id is minted fresh by every migrateV2
 * call and schema.ts carries no (assignmentDate, exerciseId, setNumber) uniqueness
 * refinement, so an id-keyed merge would store a second set 1 on a second application. The
 * identity used here is (profileId, assignmentDate, exerciseId, setNumber): profileId is part
 * of it because two profiles legitimately each hold their own set 1 of the same exercise on
 * the same day. The record already in `base` is kept and the migrated one is returned in
 * `skipped` with the reason "already present", so a repeat merge is reported, never silent.
 *
 * That rule needs a stable exerciseId, and a migrated CUSTOM exercise does not have one:
 * migrateV2 mints a fresh newId() for it on every call, so the same legacy exercise arrives
 * with a different id each time. Its identity is its name, which is already how migrateV2
 * itself collapses the legacy customEx blocks (customByName, keyed on the lower-cased name),
 * so the same rule is applied once more across the merge boundary: a name the target state
 * already holds keeps the exercise it has, and every migrated set pointing at the new id is
 * repointed at the existing one before its identity is computed. Nothing is dropped -- the
 * exercise is present and its sets stay attached to it -- so this produces no `skipped` row.
 *
 * The merged document goes through parseState, so a caller can never commit a state the
 * store would refuse on its next load.
 */
export function applyMigration(
  base: AppState,
  migrated: AppState,
  profileId: string,
): ApplyMigrationResult {
  // ---- custom exercises: identity is the name, not the freshly minted id --------------
  const baseCustom = base.customExercises[profileId] ?? [];
  const customIdByName = new Map<string, string>(
    baseCustom.map((e): [string, string] => [e.name.trim().toLowerCase(), e.id]),
  );
  /** migrated custom-exercise id -> the id the target state already uses for that name. */
  const exerciseIdRemap = new Map<string, string>();
  const addedCustom: Exercise[] = [];
  for (const ex of migrated.customExercises[profileId] ?? []) {
    const norm = ex.name.trim().toLowerCase();
    const existing = customIdByName.get(norm);
    if (existing === undefined) {
      customIdByName.set(norm, ex.id);
      addedCustom.push(ex);
      continue;
    }
    exerciseIdRemap.set(ex.id, existing);
  }

  // ---- sets: merged by identity, not by minted id ---------------------------------------
  /** The identity of a logged set, independent of the id minted for it. */
  const setKey = (s: LoggedSet): string =>
    `${s.profileId}|${s.assignmentDate}|${s.exerciseId}|${s.setNumber}`;
  const skipped: MigrationSkip[] = [];
  const mergedSets = new Map<string, LoggedSet>();
  const seenSets = new Set<string>();
  for (const [id, s] of Object.entries(base.sets)) {
    mergedSets.set(id, s);
    seenSets.add(setKey(s));
  }
  for (const [id, migratedSet] of Object.entries(migrated.sets)) {
    const reused = exerciseIdRemap.get(migratedSet.exerciseId);
    const s: LoggedSet =
      reused === undefined ? migratedSet : { ...migratedSet, exerciseId: reused };
    const key = setKey(s);
    if (seenSets.has(key)) {
      skipped.push({
        key: `sets.${s.assignmentDate}.${s.exerciseId}.${s.setNumber}`,
        reason: 'already present',
      });
      continue;
    }
    seenSets.add(key);
    mergedSets.set(id, s);
  }

  const mergedHydration = new Map<LocalDate, HydrationEntry>();
  for (const e of migrated.hydration[profileId] ?? []) mergedHydration.set(e.date, e);
  for (const e of base.hydration[profileId] ?? []) mergedHydration.set(e.date, e);

  const mergedMass = [
    ...(migrated.bodyMass[profileId] ?? []),
    ...(base.bodyMass[profileId] ?? []),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const baseInv = base.specimens[profileId];
  const migratedInv = migrated.specimens[profileId];
  const specimenInventory =
    migratedInv === undefined
      ? baseInv
      : {
          profileId,
          acquired: { ...migratedInv.acquired, ...(baseInv?.acquired ?? {}) },
          totalSetsLogged: migratedInv.totalSetsLogged + (baseInv?.totalSetsLogged ?? 0), // [sets]
        };

  const next: AppState = {
    ...base,
    // Object.fromEntries defines each key, so a set id could never reach a prototype setter.
    sets: Object.fromEntries(mergedSets),
    notes: {
      ...base.notes,
      [profileId]: { ...(migrated.notes[profileId] ?? {}), ...(base.notes[profileId] ?? {}) },
    },
    customExercises: { ...base.customExercises, [profileId]: [...baseCustom, ...addedCustom] },
    bodyMass: { ...base.bodyMass, [profileId]: mergedMass },
    hydration: {
      ...base.hydration,
      [profileId]: [...mergedHydration.values()].sort((a, b) => a.date.localeCompare(b.date)),
    },
    capsules: {
      ...base.capsules,
      [profileId]: base.capsules[profileId] ?? migrated.capsules[profileId] ?? null,
    },
    ui: { ...base.ui, legacyMigration: 'done' },
  };
  if (specimenInventory !== undefined) {
    next.specimens = { ...base.specimens, [profileId]: specimenInventory };
  }

  const parsed = parseState(next);
  if (!parsed.ok) {
    return { ok: false, reason: `the merged document does not validate: ${parsed.error}` };
  }
  return { ok: true, state: parsed.state, skipped };
}
