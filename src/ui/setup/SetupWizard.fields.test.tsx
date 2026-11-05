// A09 (a hidden field never blocks Next or Confirm) and A17 (long user text wraps on review).
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { copyFor } from '../../content/copy';
import { defaultState } from '../../domain/schema';
import { DEFAULT_BARBELL_STEP, type SetupDraft } from '../../domain/types';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { reviewDraft } from '../../../e2e/support/document';
import { SetupWizard } from './SetupWizard';
import setupCss from './setup.css?raw';

function seedDraft(draft: SetupDraft): void {
  const base = defaultState();
  useAppStore.setState({
    ...base,
    setupDraft: draft,
    ui: { ...base.ui, introSeen: true, bootSeen: true, scanlines: false, skin: 'limelight' },
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
}

/** The declarations of one rule, by exact selector. */
function rule(selector: string): string {
  const start = setupCss.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  return setupCss.slice(start, setupCss.indexOf('}', start));
}

beforeEach(() => {
  installFakeStorage();
});

describe('A09: a field that is not on screen never blocks', () => {
  it('leaves Next enabled on the equipment step when a hidden load step is blank', () => {
    seedDraft(reviewDraft({ stepIndex: 3, equipment: 'bodyweight', barbellStep: '' }));
    render(<SetupWizard />);
    expect(screen.getByRole('button', { name: copyFor('limelight', 'button.continue') })).toBeEnabled();
  });

  it('confirms with the default step in place of a blank hidden one', () => {
    seedDraft(reviewDraft({ equipment: 'bodyweight', barbellStep: '' }));
    render(<SetupWizard />);
    fireEvent.click(screen.getByLabelText(copyFor('limelight', 'label.looksGood')));
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.confirmStart') }));
    const profiles = Object.values(useAppStore.getState().profiles);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.equipmentSteps.barbellKg).toBe(DEFAULT_BARBELL_STEP.metric); // [kg]
  });
});

describe('A17: user text on the review step wraps instead of overflowing', () => {
  it('lets a review value break anywhere and shrink below its longest word', () => {
    expect(rule('.wiz dd')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule('.wiz dd')).toMatch(/min-width:\s*0/);
  });
});
