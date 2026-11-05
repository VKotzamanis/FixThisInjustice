import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FORMAT, copy, type CopyKey } from '../../../content/copy';
import { displayLoad } from '../../../domain/units';
import { SetRow, type SetRowProps } from './SetRow';

function props(patch: Partial<SetRowProps>): SetRowProps {
  return {
    t: (key: CopyKey) => copy(key),
    overrides: {},
    domIdPrefix: 'ex-test',
    n: 2,
    targetSets: 3,
    isBonus: false,
    units: 'metric',
    prescription: { kind: 'reps', lo: 6, hi: 8 },
    suggestedKg: 60, // [kg]
    logged: null,
    isBodyweightExercise: false,
    onLog: vi.fn(),
    onEdit: () => true,
    onEffort: () => true,
    onDelete: () => undefined,
    ...patch,
  };
}

function logButton(): HTMLElement {
  return screen.getByRole('button', { name: FORMAT.logSetLabel(2) });
}

describe('set-row prefill (audit C09, C16)', () => {
  it('opens with the prefill load and count and logs them, the kg exactly (C16)', () => {
    const onLog = vi.fn<SetRowProps['onLog']>();
    render(<SetRow {...props({ units: 'imperial', suggestedKg: 62.5, prefillKg: 62.5, prefillCount: 8, onLog })} />);
    expect(screen.getByLabelText(`${FORMAT.setLoadQuantity(2)} (lb)`)).toHaveValue(String(displayLoad(62.5, 'imperial')));
    expect(screen.getByLabelText(FORMAT.setRepsQuantity(2))).toHaveValue('8');
    fireEvent.click(logButton());
    expect(onLog).toHaveBeenCalledWith(62.5, { reps: 8, durationS: null }); // [kg] not 62.50503
  });

  it('follows a new prefill until the user types, then keeps what was typed', () => {
    const { rerender } = render(<SetRow {...props({ prefillKg: 60, prefillCount: 8 })} />);
    rerender(<SetRow {...props({ prefillKg: 65, prefillCount: 7 })} />); // set 1 was logged at 65 x 7
    expect(screen.getByLabelText(`${FORMAT.setLoadQuantity(2)} (kg)`)).toHaveValue('65');
    expect(screen.getByLabelText(FORMAT.setRepsQuantity(2))).toHaveValue('7');
    fireEvent.change(screen.getByLabelText(FORMAT.setRepsQuantity(2)), { target: { value: '6' } });
    rerender(<SetRow {...props({ prefillKg: 65, prefillCount: 5 })} />);
    expect(screen.getByLabelText(FORMAT.setRepsQuantity(2))).toHaveValue('6');
  });

  it('says why an empty count is refused (C09)', () => {
    const onLog = vi.fn<SetRowProps['onLog']>();
    render(<SetRow {...props({ onLog })} />);
    fireEvent.click(logButton());
    expect(onLog).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(copy('advice.repsNeeded'));
  });
});
