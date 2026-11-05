// A04 (unit switch converts) and A05 (Previous keeps the step in progress), from seeded drafts.
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { copyFor } from '../../content/copy';
import { defaultState } from '../../domain/schema';
import type { SetupDraft } from '../../domain/types';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { reviewDraft } from '../../../e2e/support/document';
import { SetupWizard } from './SetupWizard';

function seedDraft(draft: SetupDraft): void {
  const base = defaultState();
  useAppStore.setState({
    ...base,
    setupDraft: draft,
    ui: { ...base.ui, introSeen: true, bootSeen: true, scanlines: false, skin: 'limelight' },
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
}

function valueOf(container: HTMLElement, id: string): string {
  const input = container.querySelector(`#${id}`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`no input #${id}`);
  return input.value;
}

const next = (): void => {
  fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.continue') }));
};
const previous = (): void => {
  fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.back') }));
};

beforeEach(() => {
  installFakeStorage();
});

describe('A04: switching units converts the body answers already typed', () => {
  it('shows 80 kg and 1 m 80 as 176.4 lb and 5 ft 11 in on the body step', () => {
    seedDraft(reviewDraft({ stepIndex: 0, mass: '80', heightM: '1', heightCm: '80' }));
    const { container } = render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText(copyFor('limelight', 'label.unitsImperial')));
    next(); // time zone
    next(); // body
    expect(valueOf(container, 'f-mass')).toBe('176.4');
    expect(valueOf(container, 'f-height-ft')).toBe('5');
    expect(valueOf(container, 'f-height-in')).toBe('11');
  });
});

describe('A05: Previous keeps what was typed on the step', () => {
  it('shows the edited name again after going back and forward', () => {
    seedDraft(reviewDraft({ stepIndex: 2, displayName: 'Grace' }));
    const { container } = render(<SetupWizard />);
    fireEvent.change(container.querySelector('#f-name') as HTMLInputElement, { target: { value: 'Ada' } });
    previous(); // time zone
    next(); // body
    expect(valueOf(container, 'f-name')).toBe('Ada');
  });
});
