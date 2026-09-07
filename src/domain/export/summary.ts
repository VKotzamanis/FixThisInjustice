/**
 * The plain-text training summary, the human-readable half of the Export view.
 *
 * Ported from the legacy console-views.jsx ExportView with the two defects the code review
 * named repaired: the unit system is STATED in the document rather than implied (A6), and
 * every figure comes from the profile rather than from one subject's hard-coded baseline (A3).
 *
 * Plain text, not CSV. The document is a record a person reads or prints; a CSV of six
 * differently shaped sections would be neither a table nor a document. The machine-readable
 * export is the JSON one beside it in the view, which is the complete state.
 *
 * What is copy and what is not. The sentences are copy (src/content/copy.ts), so a skin can
 * reword them. The section headings and field labels are NOT: they are the document's
 * structure, the way a column header is, and renaming one would change what a stored export
 * means to anyone reading an older copy beside a newer one.
 *
 * Units. Every load and mass is rendered by src/domain/units.ts in the profile's own unit and
 * the unit is named twice, in the header and at the foot. Energy is kcal and protein g in both
 * systems; those are not display-unit quantities. Sign convention: a body-mass change is
 * latest - first, so negative means loss.
 *
 * Dates. Every date in the document is a LocalDate in the profile's zone, produced by
 * src/domain/dates.ts. No instant is printed: an epoch or an ISO timestamp in a printed record
 * invites the reader to resolve it in their own zone.
 */

import { FORMAT, copy } from '../../content/copy';
import { localDateOf } from '../dates';
import { computeTargets, isInDomain } from '../nutrition';
import type { NutritionInput } from '../nutrition';
import { EXERCISE_BY_ID } from '../plan/library';
import { computeRecords } from '../training/records';
import type { AppState, EpochMs, Exercise, Kg, UnitSystem } from '../types';
import { UNIT_LABEL, formatBeverageTarget, formatLoad, formatMass } from '../units';

/** [weeks] the period the expected body-mass change is reported over. See RATE-RESOLUTION. */
const RATE_WINDOW_WEEKS = 4;

const LABEL_WIDTH = 28; // [characters] left column of every labelled line

function pad(label: string, width = LABEL_WIDTH): string {
  return label.length >= width ? `${label} ` : label + ' '.repeat(width - label.length);
}

/**
 * Ordinal (UTF-16 code-unit) string comparison for list order that must be reproducible
 * across hosts. `String.localeCompare` is ICU-collation order, which varies with the
 * runtime's default locale (and, for the overload not used here, an explicit one); the same
 * document generated on two machines could list PERSONAL RECORDS or weekly reviews in a
 * different order. Never `a - b`-style subtraction of `codePointAt`, which is unnecessary
 * for a total order and wrong for surrogate pairs; `<`/`>` on strings already compares
 * UTF-16 code units left to right, which is all a stable sort needs here.
 */
function compareCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Collapses CR, LF and TAB to a single space. ExerciseSchema (schema.ts) bounds a name's
 * length (EXERCISE_NAME_MAX_CHARS) but not its character class, so a user-entered custom
 * exercise name may legally carry any of these. Undetected, a '\n' or '\r' inserts a hard
 * line break in the middle of a fixed-width row (pad() only pads with spaces; it does not
 * strip existing whitespace), and a '\t' desyncs the column widths that follow it. This is a
 * display concern, not a validation concern, so the raw name is not rejected -- only the
 * printed copy of it is neutralized.
 */
function sanitizeForColumn(text: string): string {
  return text.replace(/[\r\n\t]/g, ' ');
}

/** "  Protein:                   152-209 g" */
function field(label: string, value: string, indent = '  '): string {
  return `${indent}${pad(`${label}:`)}${value}`;
}

export function buildSummary(state: AppState, profileId: string, now: EpochMs): string {
  const profile = state.profiles[profileId];
  if (profile === undefined) {
    return `FIXTHISINJUSTICE TRAINING SUMMARY\n\n${FORMAT.summaryNoProfile(profileId)}\n`;
  }

  const units: UnitSystem = profile.units;
  const label = UNIT_LABEL[units];
  const today = localDateOf(now, profile.timezone);
  const massLog = state.bodyMass[profileId] ?? [];
  const latestMassKg: Kg = massLog.at(-1)?.massKg ?? profile.body.baselineMassKg; // [kg]
  const availability = state.availability[profileId] ?? null;
  const sets = Object.values(state.sets).filter((s) => s.profileId === profileId);
  const reviews = [...(state.weeklyReviews[profileId] ?? [])].sort((a, b) =>
    compareCodePoint(a.weekStart, b.weekStart),
  );

  const lines: string[] = [];
  lines.push('FIXTHISINJUSTICE TRAINING SUMMARY');
  lines.push('');
  lines.push(field('Generated', today, ''));
  lines.push(field('Profile', profile.displayName, ''));
  lines.push(field('Time zone', profile.timezone, ''));
  lines.push(field('Units', `${units} (${label.load}, ${label.volume})`, ''));
  lines.push(
    field(
      'Goal',
      profile.goal.kind +
        (profile.goal.targetMassKg === null
          ? ''
          : `, target ${formatMass(profile.goal.targetMassKg, units)}`) +
        (profile.goal.targetDate === null ? '' : ` by ${profile.goal.targetDate}`),
      '',
    ),
  );
  lines.push(
    field(
      'Baseline',
      `${formatMass(profile.body.baselineMassKg, units)} on ${profile.body.baselineAt}`,
      '',
    ),
  );
  lines.push(field('Latest body mass', formatMass(latestMassKg, units), ''));
  lines.push('');

  /*
   * The nutrition block. computeTargets throws outside the domain its equations were fitted
   * on rather than extrapolating, so the domain is checked here and the refusal is printed:
   * a summary that silently dropped the block would read as though the profile had no
   * targets, which is a different statement from "they are not estimated for this profile".
   */
  const input: NutritionInput = {
    sex: profile.body.sex,
    ageYears: Number(today.slice(0, 4)) - profile.body.birthYear, // [years]
    heightCm: profile.body.heightCm, // [cm]
    massKg: latestMassKg, // [kg]
    bodyFatPct: profile.body.baselineBodyFatPct, // [%] of body mass
    activity: profile.activity,
    goal: profile.goal.kind,
    sessionsPerWeek: availability?.weeklySessionTarget ?? 0, // [sessions/week]
    creatine: profile.supplements.creatine,
  };

  lines.push('TARGETS (per day)');
  if (!isInDomain(input)) {
    lines.push(`  ${copy('advice.targetsNotEstimatedForProfile')}`);
  } else {
    const targets = computeTargets(input);
    lines.push(field('Resting metabolic rate', `${String(Math.round(targets.rmrKcal))} kcal`));
    lines.push(field('Total daily energy', `${String(Math.round(targets.tdeeKcal))} kcal`));
    lines.push(field('Intake target', `${String(Math.round(targets.targetKcal))} kcal`));
    lines.push(
      field(
        'Protein',
        `${String(Math.round(targets.proteinG.lo))}-${String(Math.round(targets.proteinG.hi))} g`,
      ),
    );
    // A range rather than a figure when no sex was stated (nutrition.ts, decision A1).
    lines.push(field('Fluid (beverages)', formatBeverageTarget(targets.fluidML, units)));
    lines.push(
      field(
        'Creatine',
        targets.creatineG === null ? 'not taken' : `${String(targets.creatineG)} g`,
      ),
    );
    /*
     * RATE-RESOLUTION. The engine states a rate in kg/week. It is reported here as the change
     * over four weeks instead, because src/domain/units.ts formats a mass to 0.1 in the
     * display unit and a weekly rate of 0.25 kg would print as 0.3 kg, a 20 % misstatement.
     * Over four weeks the same quantity is 1.0 kg and the formatter's resolution is adequate.
     * The period is named in the label, so no arithmetic is left for the reader to do.
     */
    lines.push(
      field(
        `Expected change (${String(RATE_WINDOW_WEEKS)} weeks)`,
        targets.expectedRateKgPerWeek === null
          ? 'not estimated'
          : formatMass(targets.expectedRateKgPerWeek * RATE_WINDOW_WEEKS, units),
      ),
    );
    /*
     * The equation and the activity factor only. The engine's basis strings are multi-sentence
     * citations; they belong to the why disclosure in the UI (copy contract R9), not to a
     * printed record, where three paragraphs of DOIs would bury the figures above them.
     */
    lines.push(
      field(
        'Basis',
        `${targets.basis.rmr}, activity factor ${String(targets.basis.activityFactor)}`,
      ),
    );
  }
  lines.push('');

  lines.push('SESSIONS PER WEEK (completed / target)');
  if (reviews.length === 0) {
    lines.push(`  ${copy('advice.noWeeksYet')}`);
  } else {
    for (const r of reviews) {
      const delta = r.delta > 0 ? `+${String(r.delta)}` : String(r.delta); // [sessions]
      lines.push(
        `  ${r.weekStart}   ${String(r.completed)} / ${String(r.target)}   (${delta})${r.paused ? '   paused' : ''}`,
      );
    }
  }
  lines.push('');

  lines.push('BODY MASS');
  if (massLog.length === 0) {
    lines.push(`  ${copy('advice.noBodyMassLogged')}`);
  } else {
    for (const entry of massLog) {
      lines.push(`  ${entry.date}   ${formatMass(entry.massKg, units)}`);
    }
    const first = massLog[0];
    if (first !== undefined && massLog.length > 1) {
      // latest - first, so a negative value is a loss (master plan section 3).
      lines.push(field('Change since the first check-in', formatMass(latestMassKg - first.massKg, units)));
    }
  }
  lines.push('');

  /*
   * The records block. computeRecords (P7 Task 4) is the single definition of what a record
   * is, shared with the Log view: the summary must not hold a second rule, or a printed
   * export and the screen it was taken from could disagree about the same set.
   *
   * A record with no bestSet is one whose sets carry no repetition count, so there is nothing
   * to state. The estimated 1RM is labelled as an estimate wherever it appears (FORMAT), and
   * a set outside the Epley equation's domain simply has none.
   */
  const library: Record<string, Exercise> = { ...EXERCISE_BY_ID };
  for (const ex of state.customExercises[profileId] ?? []) library[ex.id] = ex;
  const records = [...computeRecords(sets).values()]
    .filter((r) => r.bestSet !== null)
    .map((r) => ({ ...r, name: sanitizeForColumn(library[r.exerciseId]?.name ?? r.exerciseId) }))
    .sort((a, b) => compareCodePoint(a.name, b.name));

  lines.push('PERSONAL RECORDS');
  if (records.length === 0) {
    lines.push(`  ${copy('advice.noSetsLogged')}`);
  } else {
    for (const r of records) {
      const best = r.bestSet;
      if (best === null) continue; // filtered above; narrows the type
      const heaviest = FORMAT.loggedSet(formatLoad(best.loadKg, units), String(best.reps));
      const estimate =
        r.bestE1RM === null
          ? copy('status.noEstimated1RM')
          : FORMAT.estimated1RM(formatLoad(r.bestE1RM.e1RMKg, units));
      lines.push(`  ${pad(r.name, 30)}${pad(heaviest, 18)}${pad(estimate, 26)}${best.date}`);
    }
  }
  lines.push('');

  lines.push('TOTALS');
  lines.push(field('Sets logged', String(sets.length)));
  lines.push(field('Body-mass check-ins', String(massLog.length)));
  lines.push(field('Weeks reviewed', String(reviews.length)));
  lines.push('');
  lines.push(FORMAT.summaryUnitsFooter(label.load));
  lines.push('');
  return lines.join('\n');
}
