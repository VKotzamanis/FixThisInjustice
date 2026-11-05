import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { copyFor } from '../../content/copy';
import { useAppStore } from '../../store';
import { NOW_MS, PREV_MONDAY, PROFILE_ID, makeAvailability, seedState } from '../../test/scheduleFixtures';
import { AvailabilitySettings } from './AvailabilitySettings';

const c = (key: Parameters<typeof copyFor>[1]): string => copyFor('limelight', key);

function seed(): void {
  useAppStore.setState({
    ...seedState({ labels: ['A', 'B', 'C', 'A', 'B', 'C'], weekdays: [1, 3, 5], startedOn: PREV_MONDAY }),
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
}

function renderEditor(): void {
  const profile = useAppStore.getState().profiles[PROFILE_ID];
  if (profile === undefined) throw new Error('fixture: no profile');
  render(<AvailabilitySettings profile={profile} />);
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  seed();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AvailabilitySettings (D05)', () => {
  it('saves new days and target through the store, leaving the plan and the cursor alone', () => {
    const before = useAppStore.getState();
    renderEditor();
    const save = screen.getByRole('button', { name: c('button.saveTrainingDays') });
    expect(save).toBeDisabled(); // nothing changed yet
    fireEvent.click(screen.getByLabelText(c('weekday.friday')));
    fireEvent.change(screen.getByLabelText(c('quantity.weeklySessionTarget')), { target: { value: '2' } });
    fireEvent.click(save);
    const after = useAppStore.getState();
    expect(after.availability[PROFILE_ID]).toEqual(makeAvailability([1, 3], 2, '07:00'));
    expect(after.plans).toBe(before.plans);
    expect(after.cursors).toBe(before.cursors);
  });

  it('bounds the target by the days chosen', () => {
    renderEditor();
    fireEvent.click(screen.getByLabelText(c('weekday.friday')));
    fireEvent.click(screen.getByLabelText(c('weekday.wednesday')));
    const target = screen.getByLabelText(c('quantity.weeklySessionTarget'));
    expect((target as HTMLSelectElement).value).toBe('1');
    expect(Array.from((target as HTMLSelectElement).options).map((o) => o.value)).toEqual(['1']);
  });

  it('refuses no days and a cleared start time before the store is asked', () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText(`${c('weekday.monday')} ${c('label.startTime')}`), {
      target: { value: '' },
    });
    expect(screen.getByText(c('error.startTimeRequired'))).toBeTruthy();
    expect(screen.getByRole('button', { name: c('button.saveTrainingDays') })).toBeDisabled();
    for (const day of ['weekday.monday', 'weekday.wednesday', 'weekday.friday'] as const) {
      fireEvent.click(screen.getByLabelText(c(day)));
    }
    expect(screen.getByText(c('error.pickOneDay'))).toBeTruthy();
    expect(screen.getByRole('button', { name: c('button.saveTrainingDays') })).toBeDisabled();
  });

  it('shows a store refusal beside Save and changes nothing', () => {
    const before = useAppStore.getState().availability;
    useAppStore.setState({
      updateAvailability: () => {
        throw new Error('updateAvailability: refused in this test');
      },
    });
    renderEditor();
    fireEvent.click(screen.getByLabelText(c('weekday.friday')));
    fireEvent.click(screen.getByRole('button', { name: c('button.saveTrainingDays') }));
    expect(screen.getByRole('alert').textContent).toBe(c('error.availabilityRefused'));
    expect(useAppStore.getState().availability).toBe(before);
  });
});
