// Weekly AMRAP sparkline: best repetitions per ISO week for one bodyweight exercise.
//
// Deviations from the P7 plan's Task 4 Step 14 literal (recorded here; the plan is not edited):
//  - Exercise and LoggedSet come from src/test/fixtures.ts, for the reason PRList.test.tsx
//    records: the plan's literal predates `secondaryMuscles`.
//  - The chart carries an axis label and an accessible name stating the week range and the
//    last value, which the plan's draft did not require.

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FORMAT } from '../../content/copy';
import type { Exercise } from '../../domain/types';
import { makeExercise, makeSet, resetFixtureIds } from '../../test/fixtures';
import { AmrapSpark } from './AmrapSpark';

const PUSHUP: Exercise = makeExercise({
  id: 'push-up',
  name: 'Push-up',
  isBodyweight: true,
  modality: 'bodyweight',
});

/** One unloaded set on a given civil date. */
function set(date: string, reps: number) {
  return makeSet({
    assignmentDate: date,
    exerciseId: PUSHUP.id,
    loadKg: 0, // [kg] bodyweight
    reps, // [repetitions]
    isBonus: true,
  });
}

beforeEach(() => {
  resetFixtureIds();
});

describe('AmrapSpark', () => {
  it('says so when the exercise has no logged reps', () => {
    render(<AmrapSpark sets={[]} exercise={PUSHUP} />);
    expect(screen.getByText(FORMAT.noSetsForExercise(PUSHUP.name))).toBeTruthy();
  });

  it('draws one point per ISO week and states the best set', () => {
    const { container } = render(
      <AmrapSpark
        sets={[set('2026-01-08', 12), set('2026-01-09', 10), set('2026-01-15', 15)]}
        exercise={PUSHUP}
      />,
    );
    expect(container.querySelectorAll("[data-testid='amrap-point']")).toHaveLength(2);
    expect(screen.getByText(FORMAT.amrapBest(PUSHUP.name, 15))).toBeTruthy();
  });

  it('ignores sets logged against another exercise', () => {
    const { container } = render(
      <AmrapSpark
        sets={[set('2026-01-08', 12), makeSet({ exerciseId: 'pull-up', loadKg: 0, reps: 99 })]}
        exercise={PUSHUP}
      />,
    );
    expect(container.querySelectorAll("[data-testid='amrap-point']")).toHaveLength(1);
    expect(screen.getByText(FORMAT.amrapBest(PUSHUP.name, 12))).toBeTruthy();
  });

  it('does not divide by zero on a single week', () => {
    const { container } = render(<AmrapSpark sets={[set('2026-01-08', 12)]} exercise={PUSHUP} />);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('labels its axis with the unit and names its range and last value', () => {
    const { container } = render(
      <AmrapSpark sets={[set('2026-01-08', 12), set('2026-01-15', 15)]} exercise={PUSHUP} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe(
      FORMAT.amrapChartLabel(PUSHUP.name, '2026-01-05', '2026-01-12', 15),
    );
    const axis = [...container.querySelectorAll("[data-testid='y-label']")].map(
      (n) => n.textContent ?? '',
    );
    expect(axis).toContain(FORMAT.repsCount(15));
  });
});
