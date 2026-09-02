// src/ui/views/LogView.tsx
//
// The Log view: what has actually happened, in four readings.
//
//   Body mass    the measured series against the projection the nutrition engine expects
//   Compliance   one row per ISO week since the programme started, one cell per training day
//   Best reps    a weekly AMRAP sparkline per bodyweight exercise the log mentions
//   Records      the heaviest set and the best Epley estimate per exercise
//
// Nothing here writes. Every number is read from the stored document and formatted for display
// through src/domain/units.ts, so the profile's unit is applied in exactly one layer and the
// stored kilograms are never altered to be shown.
//
// The nutrition targets come from the store's useNutritionTargets selector rather than from a
// computeTargets call during render. computeTargets THROWS outside its validated domain
// (src/domain/nutrition.ts), and a throw during render takes the whole tree to the error
// boundary; the selector answers null instead, which is a state this view can draw.

import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { FORMAT, copy } from '../../content/copy';
import { addDays, compareLocalDate, daysBetween, weekStart } from '../../domain/dates';
import { EXERCISE_BY_ID } from '../../domain/plan/library';
import type {
  BodyMassEntry,
  Exercise,
  IsoWeekday,
  LocalDate,
  LoggedSet,
  SessionAssignment,
} from '../../domain/types';
import { formatMass } from '../../domain/units';
import { useAppStore } from '../../store';
import { useActiveCursor, useActiveProfileId, useTodayDate } from '../../store/scheduleSelectors';
import { useActiveProfile, useNutritionTargets } from '../../store/selectors';
import { AmrapSpark } from '../components/AmrapSpark';
import { BodyMassChart } from '../components/BodyMassChart';
import { ComplianceGrid } from '../components/ComplianceGrid';
import { PRList } from '../components/PRList';
import './views.css';

/**
 * [weeks] Most weeks the compliance grid will draw. A programme begun years ago would
 * otherwise render hundreds of rows the user has to scroll past to reach the present, so the
 * window is anchored at the PRESENT and drops the oldest weeks, exactly as closeWeeks anchors
 * its own evaluation window (src/domain/schedule/weekly.ts).
 */
const MAX_WEEKS_SHOWN = 26;

/** [d] Shortest horizon the body-mass projection is drawn over, so a new profile still has an axis. */
const MIN_HORIZON_DAYS = 7;

/** Stable empty values, so a profile with no history does not hand a new array down each render. */
const NO_ASSIGNMENTS: readonly SessionAssignment[] = [];
const NO_BODY_MASS: readonly BodyMassEntry[] = [];

/**
 * Every Monday from the week containing `from` up to and including the week containing `to`,
 * ascending, at most `MAX_WEEKS_SHOWN` of them.
 *
 * Returns nothing when `to` precedes `from`, which is a clock that has moved backwards or a
 * cursor started in the future; neither is a week the user has trained.
 */
export function weeksBetween(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  const last = weekStart(to);
  let cursor = weekStart(from);
  while (compareLocalDate(cursor, last) <= 0) {
    out.push(cursor);
    cursor = addDays(cursor, 7); // [d]
  }
  return out.length > MAX_WEEKS_SHOWN ? out.slice(out.length - MAX_WEEKS_SHOWN) : out;
}

export function LogView(): ReactElement {
  const profile = useActiveProfile();
  const profileId = useActiveProfileId();
  const targets = useNutritionTargets();
  const cursor = useActiveCursor();
  const today = useTodayDate();

  // Each of these selects the STORED array itself, so the snapshot is referentially stable
  // between unrelated store updates; a derived copy inside the selector would be a changed
  // snapshot on every render and would loop useSyncExternalStore.
  const bodyMass = useAppStore((s) =>
    s.activeProfileId === null ? null : (s.bodyMass[s.activeProfileId] ?? null),
  );
  const assignments = useAppStore((s) =>
    s.activeProfileId === null ? null : (s.assignments[s.activeProfileId] ?? null),
  );
  const availability = useAppStore((s) =>
    s.activeProfileId === null ? null : (s.availability[s.activeProfileId] ?? null),
  );
  const customExercises = useAppStore((s) =>
    s.activeProfileId === null ? null : (s.customExercises[s.activeProfileId] ?? null),
  );
  const allSets = useAppStore((s) => s.sets);

  const sets = useMemo<LoggedSet[]>(
    () =>
      profileId === null
        ? []
        : Object.values(allSets).filter((s) => s.profileId === profileId),
    [allSets, profileId],
  );

  // The shipped library plus the profile's own additions. A user-added exercise wins on a
  // collision: it is the definition this profile's sets were logged against.
  const library = useMemo<Record<string, Exercise>>(() => {
    const merged: Record<string, Exercise> = { ...EXERCISE_BY_ID };
    for (const ex of customExercises ?? []) merged[ex.id] = ex;
    return merged;
  }, [customExercises]);

  // Compliance is a fact about a RUNNING programme, so the weeks come from the cursor's own
  // start date and from nothing else. Before a plan is set there is no target to be compliant
  // with, and grading the weeks since the profile was created would invent one.
  const startedOn = cursor?.startedOn ?? null;
  const weekStarts = useMemo<LocalDate[]>(
    () => (startedOn === null ? [] : weeksBetween(startedOn, today)),
    [startedOn, today],
  );

  const slotWeekdays = useMemo<IsoWeekday[]>(() => {
    const seen = new Set<IsoWeekday>();
    for (const slot of availability?.slots ?? []) seen.add(slot.weekday);
    return [...seen].sort((a, b) => a - b);
  }, [availability]);

  // One sparkline per bodyweight exercise the log actually mentions, named order so the
  // sections do not reshuffle when a set is added.
  const bodyweightExercises = useMemo<Exercise[]>(() => {
    const ids = new Set(sets.map((s) => s.exerciseId));
    const out: Exercise[] = [];
    for (const id of ids) {
      const ex = library[id];
      if (ex !== undefined && ex.isBodyweight) out.push(ex);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [sets, library]);

  // Every hook above runs unconditionally, so this exit does not change the hook order.
  if (profile === null) {
    return (
      <section className="view log">
        <h2>{copy('nav.log')}</h2>
        <p className="view-note">{copy('advice.noProfileSetupFirst')}</p>
      </section>
    );
  }

  const entries = bodyMass ?? NO_BODY_MASS;
  const baselineDate = profile.body.baselineAt;
  // [d] The projection runs from the baseline to today. Drawing it into the future would
  // extrapolate a rate the engine states for the present, so the chart stops where the
  // evidence does; the chart itself widens the span for any weigh-in outside it.
  const horizonDays = Math.max(MIN_HORIZON_DAYS, daysBetween(baselineDate, today));
  const rateKgPerWeek = targets?.expectedRateKgPerWeek ?? null; // [kg/week] signed, negative = loss

  return (
    <section className="view log">
      <h2>{copy('nav.log')}</h2>

      <h3>{copy('hero.bodyMass')}</h3>
      {entries.length === 0 && <p className="view-note">{copy('advice.noBodyMassLogged')}</p>}
      <BodyMassChart
        entries={entries}
        units={profile.units}
        baselineKg={profile.body.baselineMassKg} // [kg]
        baselineDate={baselineDate}
        expectedRateKgPerWeek={rateKgPerWeek} // [kg/week]
        horizonDays={horizonDays} // [d]
        today={today}
      />
      {/* R9: the rate the dashed line is drawn at, and the rule behind it, are arithmetic. */}
      <details data-testid="body-mass-basis">
        <summary>{copy('disclosure.why')}</summary>
        <div className="view-note">
          <p>
            {rateKgPerWeek === null
              ? copy('status.rateUnknown')
              : FORMAT.bodyMassProjection(formatMass(rateKgPerWeek, profile.units))}
          </p>
          {targets !== null && <p>{targets.basis.rateRule}</p>}
        </div>
      </details>

      <h3>{copy('hero.compliance')}</h3>
      <ComplianceGrid
        assignments={assignments ?? NO_ASSIGNMENTS}
        weekStarts={weekStarts}
        slotWeekdays={slotWeekdays}
        today={today}
        weeklySessionTarget={availability?.weeklySessionTarget ?? 0} // [sessions/week]
      />

      {bodyweightExercises.length > 0 && (
        <>
          <h3>{copy('hero.repsPerWeek')}</h3>
          {bodyweightExercises.map((ex) => (
            <AmrapSpark key={ex.id} sets={sets} exercise={ex} />
          ))}
        </>
      )}

      <h3>{copy('hero.personalRecords')}</h3>
      <PRList sets={sets} library={library} units={profile.units} />
    </section>
  );
}
