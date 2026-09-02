// Personal records list: the heaviest set and the best Epley estimate per exercise.
//
// Deviations from the P7 plan's Task 4 Step 14 literal (recorded here; the plan is not edited):
//  - The Exercise and LoggedSet literals are replaced by `makeExercise` and `makeSet` from
//    src/test/fixtures.ts. The plan's literal omits `secondaryMuscles`, which the shipped
//    Exercise type requires.
//  - The list is ordered by DATE, most recent record first, which is the ordering this task's
//    brief fixes. The plan's draft sorted by exercise name.
//  - Every string quotes src/content/copy.ts and src/domain/units.ts.

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FORMAT, copy, copyFor } from '../../content/copy';
import { e1RM } from '../../domain/training/progression';
import type { Exercise } from '../../domain/types';
import { formatLoad } from '../../domain/units';
import { makeExercise, makeSet, resetFixtureIds } from '../../test/fixtures';
import { PRList } from './PRList';
import { useAppStore } from '../../store';
import type { SkinId } from '../../domain/types';

const BENCH: Exercise = makeExercise();
const ROW: Exercise = makeExercise({ id: 'pendlay-row', name: 'Pendlay row' });
const LIBRARY: Readonly<Record<string, Exercise>> = { [BENCH.id]: BENCH, [ROW.id]: ROW };

beforeEach(() => {
  resetFixtureIds();
});

/*
 * The app ships with `ui.skin: 'limelight'` (src/domain/schema.ts), so a component that reads
 * the table through `useCopy()` renders the limelight words unless a test says otherwise. The
 * assertions in this file quote the DEFAULT table, so the skin is pinned to clinical before
 * each of them; what a skin changes has its own test.
 *
 * A seed that REPLACES `ui` (makeAppState, defaultState, wipeAll) puts the shipped skin back,
 * so it is a named function rather than an inline hook body: a test that reseeds calls it
 * again, after the seed.
 */
function pinSkin(skin: SkinId = 'clinical'): void {
  useAppStore.setState((s) => ({ ui: { ...s.ui, skin } }));
}

beforeEach(() => {
  pinSkin();
});

describe('PRList', () => {
  it('says so when nothing has been logged', () => {
    render(<PRList sets={[]} library={LIBRARY} units="metric" />);
    expect(screen.getByText(copy('advice.noSetsLogged'))).toBeTruthy();
  });

  it('shows the heaviest set and the best estimated 1RM, in kg', () => {
    render(
      <PRList
        sets={[
          makeSet({ loadKg: 60, reps: 8 }), // [kg]
          makeSet({ loadKg: 90, reps: 3 }), // [kg]
        ]}
        library={LIBRARY}
        units="metric"
      />,
    );
    expect(screen.getByText(BENCH.name)).toBeTruthy();
    expect(
      screen.getByText(FORMAT.loggedSet(formatLoad(90, 'metric'), '3')), // "90 kg" and 3 reps
    ).toBeTruthy();
    // Epley on the 90 kg triple: 90 * (1 + 3/30) = 99 kg, above the 60 kg eight's 76 kg.
    expect(
      screen.getByText(FORMAT.estimated1RM(formatLoad(e1RM(90, 3), 'metric'))),
    ).toBeTruthy();
  });

  it('shows the same records in lb for an imperial profile', () => {
    render(
      <PRList sets={[makeSet({ loadKg: 60, reps: 8 })]} library={LIBRARY} units="imperial" />,
    );
    // 60 kg is 132.3 lb at 0.1 resolution; the stored kilograms are unchanged.
    expect(screen.getByText(FORMAT.loggedSet(formatLoad(60, 'imperial'), '8'))).toBeTruthy();
    expect(formatLoad(60, 'imperial')).toBe('132.3 lb');
  });

  it('names an exercise that is not in the library by its id', () => {
    render(
      <PRList sets={[makeSet({ exerciseId: 'ghost' })]} library={LIBRARY} units="metric" />,
    );
    expect(screen.getByText('ghost')).toBeTruthy();
  });

  it('shows a bodyweight record as BW rather than as a zero load', () => {
    render(
      <PRList
        sets={[makeSet({ exerciseId: 'ghost', loadKg: 0, reps: 20 })]} // [kg]
        library={LIBRARY}
        units="metric"
      />,
    );
    expect(screen.getByText(FORMAT.loggedSet(formatLoad(0, 'metric'), '20'))).toBeTruthy();
    expect(screen.getByText(copy('status.noEstimated1RM'))).toBeTruthy();
  });

  it('orders the list by the date of the record, most recent first', () => {
    render(
      <PRList
        sets={[
          makeSet({ exerciseId: 'ghost', loadKg: 50, reps: 5, assignmentDate: '2026-01-05' }),
          makeSet({ exerciseId: ROW.id, loadKg: 70, reps: 6, assignmentDate: '2026-02-16' }),
          makeSet({ exerciseId: BENCH.id, loadKg: 90, reps: 3, assignmentDate: '2026-01-26' }),
        ]}
        library={LIBRARY}
        units="metric"
      />,
    );
    const names = screen.getAllByTestId('pr-name').map((n) => n.textContent);
    expect(names).toEqual([ROW.name, BENCH.name, 'ghost']);
    const dates = screen.getAllByTestId('pr-date').map((n) => n.textContent);
    expect(dates).toEqual(['2026-02-16', '2026-01-26', '2026-01-05']);
  });

  it('leaves out an exercise whose only sets carry no rep count', () => {
    // A timed hold logs a duration and no reps. It is not a repetition record.
    render(
      <PRList
        sets={[makeSet({ exerciseId: 'ghost', reps: null, durationS: 45 })]} // [s]
        library={LIBRARY}
        units="metric"
      />,
    );
    expect(screen.getByText(copy('advice.noSetsLogged'))).toBeTruthy();
  });
});

/*
 * P8 Task 16: the words come from the copy table through `useCopy()`, so `ui.skin` decides
 * them. Asserted by KEY through `copyFor`, never as a literal, so the expectation follows the
 * table instead of having to be rewritten beside it.
 */
describe('PRList under a skin', () => {
  it('states the empty list in the limelight words, and in the default ones under clinical', () => {
    pinSkin('limelight');
    const view = render(<PRList sets={[]} library={LIBRARY} units="metric" />);
    expect(screen.getByText(copyFor('limelight', 'advice.noSetsLogged'))).toBeInTheDocument();
    view.unmount();

    pinSkin('clinical');
    render(<PRList sets={[]} library={LIBRARY} units="metric" />);
    expect(screen.getByText(copyFor('clinical', 'advice.noSetsLogged'))).toBeInTheDocument();
  });
});
