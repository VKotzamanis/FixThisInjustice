import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FORMAT, copy, type CopyKey } from '../../../content/copy';
import { SetRow, type SetRowProps } from './SetRow';

function props(onLog: SetRowProps['onLog']): SetRowProps {
  return {
    t: (key: CopyKey) => copy(key),
    overrides: {},
    domIdPrefix: 'ex-test',
    n: 2,
    targetSets: 3,
    isBonus: false,
    units: 'metric',
    prescription: { kind: 'reps', lo: 5, hi: 8 },
    suggestedKg: null,
    logged: null,
    isBodyweightExercise: false,
    onLog,
    onEdit: () => true,
    onEffort: () => true,
    onDelete: () => undefined,
    referenceKg: 62.5, // [kg] set 1's load
  };
}

function enter(load: string, reps: string): void {
  fireEvent.change(screen.getByLabelText(`${FORMAT.setLoadQuantity(2)} (kg)`), { target: { value: load } });
  fireEvent.change(screen.getByLabelText(FORMAT.setRepsQuantity(2)), { target: { value: reps } });
  fireEvent.click(screen.getByRole('button', { name: FORMAT.logSetLabel(2) }));
}

describe('the load plausibility confirm (spec R4)', () => {
  // onLog reports a stored set (Task 12 / AM-12: false would mean the store refused it).
  it('asks once for a load far from the reference, and Log Anyway logs it', () => {
    const onLog = vi.fn(() => true);
    render(<SetRow {...props(onLog)} />);
    enter('625', '5');
    expect(onLog).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(copy('advice.loadLooksOff'));
    fireEvent.click(screen.getByRole('button', { name: copy('button.logAnyway') }));
    expect(onLog).toHaveBeenCalledWith(625, { reps: 5, durationS: null }); // [kg]
  });

  it('logs a plausible load at once', () => {
    const onLog = vi.fn(() => true);
    render(<SetRow {...props(onLog)} />);
    enter('65', '5');
    expect(onLog).toHaveBeenCalledWith(65, { reps: 5, durationS: null });
  });

  it('drops the question when the load is edited', () => {
    const onLog = vi.fn(() => true);
    render(<SetRow {...props(onLog)} />);
    enter('625', '5');
    fireEvent.change(screen.getByLabelText(`${FORMAT.setLoadQuantity(2)} (kg)`), { target: { value: '62,5' } });
    expect(screen.queryByRole('button', { name: copy('button.logAnyway') })).toBeNull();
  });
});
