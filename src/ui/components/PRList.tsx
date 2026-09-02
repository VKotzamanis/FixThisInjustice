// src/ui/components/PRList.tsx
//
// Personal records, one row per exercise the log mentions.
//
// Ported from console-views.jsx PRList. The max-by-(load, reps) reduction was correct and is
// kept, but it now lives in src/domain/training/records.ts where it is tested, instead of in a
// useMemo inside the view. Three other things changed:
//   A1, A5  the unit label came from the literal string "kg". It now comes from the profile,
//           through src/domain/units.ts, so an imperial profile reads pounds.
//   -       the estimated one-repetition maximum is shown BESIDE the heaviest set rather than
//           instead of it. They are frequently different sessions: the heaviest set is what was
//           lifted, the estimate is an ordering index over sets at different rep counts.
//   -       the list is ordered by the date of the record, most recent first, so the row a user
//           opens the view to see is the one at the top.
//
// The estimate is Epley's, load * (1 + reps / 30), evaluated in progression.ts and guarded
// there to at most ten repetitions. Reynolds et al. (2006) report a standard error of estimate
// of 1.85 kg to 14.05 kg at 5RM, so it is labelled "estimated 1RM" everywhere it appears and
// is never presented as a measured maximum.

import type { ReactElement } from 'react';
import { FORMAT, copy } from '../../content/copy';
import { compareLocalDate } from '../../domain/dates';
import { computeRecords } from '../../domain/training/records';
import type { ExerciseRecords } from '../../domain/training/records';
import type { Exercise, LoggedSet, UnitSystem } from '../../domain/types';
import { formatLoad } from '../../domain/units';

export interface PRListProps {
  sets: readonly LoggedSet[];
  /** The exercise library merged with the profile's own additions, keyed by id. */
  library: Readonly<Record<string, Exercise>>;
  units: UnitSystem;
}

interface PRRow extends ExerciseRecords {
  name: string;
}

export function PRList(props: PRListProps): ReactElement {
  const { sets, library, units } = props;

  const rows: PRRow[] = [...computeRecords(sets).values()]
    // An exercise whose every set carries no rep count (a timed hold) has no repetition
    // record. It is counted in totalSets and has nothing to show here.
    .filter((r) => r.bestSet !== null)
    .map((r) => ({
      ...r,
      // An exercise the library no longer holds is named by its id: ugly and honest, where
      // throwing would take the view down over a label (the rule ui/format/plan.ts follows).
      name: library[r.exerciseId]?.name ?? r.exerciseId,
    }))
    .sort((a, b) => {
      const byDate = compareLocalDate(b.bestSet?.date ?? '', a.bestSet?.date ?? '');
      // Most recent first; the name only breaks a tie, so the order is total and stable.
      return byDate !== 0 ? byDate : a.name.localeCompare(b.name);
    });

  if (rows.length === 0) {
    return <p className="view-note">{copy('advice.noSetsLogged')}</p>;
  }

  return (
    <ul className="pr-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {rows.map((r) => (
        <li
          key={r.exerciseId}
          className="pr-row"
          style={{ display: 'grid', gap: '0 0.75rem', padding: '0.15rem 0' }}
        >
          <span className="pr-name" data-testid="pr-name">
            {r.name}
          </span>
          <span
            className="pr-best"
            data-testid="pr-best"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {/* The load is formatted in the profile's unit; "BW" is what a 0 kg load reads as. */}
            {FORMAT.loggedSet(
              formatLoad(r.bestSet?.loadKg ?? null, units),
              String(r.bestSet?.reps ?? 0),
            )}
          </span>
          <span
            className="pr-e1rm"
            data-testid="pr-e1rm"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {r.bestE1RM === null
              ? copy('status.noEstimated1RM')
              : FORMAT.estimated1RM(formatLoad(r.bestE1RM.e1RMKg, units))}
          </span>
          <span
            className="pr-date"
            data-testid="pr-date"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {r.bestSet?.date ?? ''}
          </span>
        </li>
      ))}
    </ul>
  );
}
