import { describe, expect, it } from 'vitest';
import { answersOf, restoreWizardState, wizardReducer } from './wizardState';
import { validAnswers } from './testAnswers';

describe('wizardReducer: the two-tier draft (A2, A05)', () => {
  const start = { stepIndex: 2, committed: validAnswers(), buffer: null };

  it('typing reaches the buffer only; Next commits it and empties the buffer', () => {
    const typed = wizardReducer(start, { type: 'patch', next: { displayName: 'New' } });
    expect(typed.committed.displayName).toBe('Tester');
    expect(answersOf(typed).displayName).toBe('New');
    const next = wizardReducer(typed, { type: 'next' });
    expect(next).toEqual({ stepIndex: 3, committed: answersOf(typed), buffer: null });
  });

  it('A05: Back keeps the step in progress and commits nothing', () => {
    const typed = wizardReducer(start, { type: 'patchDay', weekday: 2, next: { enabled: true } });
    const back = wizardReducer(typed, { type: 'back' });
    expect(back.stepIndex).toBe(1);
    expect(back.buffer?.days[2].enabled).toBe(true);
    expect(back.committed.days[2].enabled).toBe(false);
  });

  it('Next on an untouched step keeps the committed object itself', () => {
    expect(wizardReducer(start, { type: 'next' }).committed).toBe(start.committed);
  });

  it('A06: restores by step id, separating the tiers', () => {
    const restored = restoreWizardState({ ...validAnswers(), stepIndex: 8, stepId: 'goal', buffer: null });
    expect(restored.stepIndex).toBe(4);
    expect(restored.committed).toEqual(validAnswers());
  });
});
