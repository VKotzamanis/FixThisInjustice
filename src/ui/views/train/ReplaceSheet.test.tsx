// src/ui/views/train/ReplaceSheet.test.tsx
//
// The Replace sheet on the one overlay stack: Android Back (a popstate to the entry under the
// sheet) and the scrim close it; a row tap picks; a refused pick keeps it open with the refusal.
// A file of its own: the history module's traversal count is per module instance, and
// TrainView.test.tsx stubs history.go as a no-op elsewhere, which would swallow this Back.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, FORMAT } from '../../../content/copy';
import { EXERCISE_BY_ID } from '../../../domain/plan/library';
import type { ReplaceChoices } from '../../../domain/training/sessionEdits';
import type { Exercise } from '../../../domain/types';
import { ReplaceSheet } from './ReplaceSheet';

function ex(id: string): Exercise {
  const e = EXERCISE_BY_ID[id];
  if (e === undefined) throw new Error(`library.ts no longer defines ${id}`);
  return e;
}

const CHOICES: ReplaceChoices = {
  backToPlan: ex('cable-triceps-pushdown'),
  recommended: ex('triceps-overhead-extension'),
  sameMuscle: [ex('bench-dip')],
  others: [ex('barbell-back-squat')],
};

function renderSheet(onPick: (id: string) => boolean = () => true) {
  const onClose = vi.fn();
  const pick = vi.fn(onPick);
  render(
    <ReplaceSheet
      t={(k) => copy(k)}
      overrides={{}}
      name="Close-grip bench press"
      choices={CHOICES}
      onPick={pick}
      onClose={onClose}
    />,
  );
  return { onClose, pick };
}

describe('ReplaceSheet', () => {
  beforeEach(() => {
    vi.spyOn(window.history, 'go').mockImplementation(() => {
      setTimeout(() => {
        window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state as unknown }));
      }, 0);
    });
  });

  it('lists recommended, Back to the Plan, same muscle, then a closed Other Exercises', () => {
    renderSheet();
    const dialog = screen.getByRole('dialog', {
      name: FORMAT.withSlots('label.replaceTitle', { name: 'Close-grip bench press' }),
    });
    const names = [...dialog.querySelectorAll('.replace-name')].map((n) => n.textContent);
    expect(names).toEqual([
      'Overhead triceps extension',
      FORMAT.withSlots('label.backToPlan', { name: 'Cable triceps pushdown' }),
      'Bench dip',
      'Barbell back squat',
    ]);
    expect(dialog.querySelector('.is-recommended .replace-tag')?.textContent).toBe(copy('label.recommended'));
    expect((dialog.querySelector('details.replace-more') as HTMLDetailsElement).open).toBe(false);
  });

  it('picks the tapped row by id', () => {
    const { pick } = renderSheet();
    fireEvent.click(screen.getByText(FORMAT.withSlots('label.backToPlan', { name: 'Cable triceps pushdown' })));
    expect(pick).toHaveBeenCalledWith('cable-triceps-pushdown');
  });

  it('stays open and says so when the store refuses the pick', () => {
    const { onClose } = renderSheet(() => false);
    fireEvent.click(screen.getByText('Bench dip'));
    expect(screen.getByRole('alert').textContent).toBe(copy('status.sessionEditRefused'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on the scrim', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByTestId('replace-sheet'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Back (popstate to the entry under the sheet)', async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20)); // [ms] earlier traversals land
    });
    const { onClose } = renderSheet();
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { fti: { view: 'train', depth: 0 } } }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
