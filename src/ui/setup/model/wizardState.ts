// src/ui/setup/model/wizardState.ts
//
// The wizard's two-tier draft as a reducer (audit A16 recommended shape). Round 2 claim r2.11 /
// plan decision A2: typing goes to `buffer` and only Next replaces `committed`. Audit A05: Back
// keeps the buffer, so a look back loses nothing typed, and still commits nothing.
import type { IsoWeekday, SetupAnswers, SetupDraft } from '../../../domain/types';
import { STEPS, initialAnswers, restoreStepIndex, type DaySlot } from './answers';

export interface WizardState {
  stepIndex: number;
  /** The answers Next has accepted. */
  committed: SetupAnswers;
  /** The step in progress as a WHOLE answer set, or null when nothing is uncommitted. */
  buffer: SetupAnswers | null;
}

export type WizardAction =
  | { type: 'patch'; next: Partial<SetupAnswers> }
  | { type: 'patchDay'; weekday: IsoWeekday; next: Partial<DaySlot> }
  | { type: 'next' }
  | { type: 'back' };

/** The state a stored draft resumes (C1.G.1), or a fresh one. */
export function restoreWizardState(stored: SetupDraft | null): WizardState {
  if (stored === null) return { stepIndex: 0, committed: initialAnswers(), buffer: null };
  const { stepIndex, stepId, buffer, ...committed } = stored;
  void stepIndex; // read through restoreStepIndex below
  void stepId;
  return { stepIndex: restoreStepIndex(stored), committed, buffer };
}

/** What the screen renders: the committed answers with the step in progress laid over them. */
export function answersOf(s: WizardState): SetupAnswers {
  return s.buffer ?? s.committed;
}

export function wizardReducer(s: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'patch':
      // Seeds the buffer from the committed answers on the first edit of a step.
      return { ...s, buffer: { ...answersOf(s), ...action.next } };
    case 'patchDay': {
      const base = answersOf(s);
      return {
        ...s,
        buffer: { ...base, days: { ...base.days, [action.weekday]: { ...base.days[action.weekday], ...action.next } } },
      };
    }
    case 'next':
      // Only this replaces the stored answers (A2). An untouched step keeps `committed` itself.
      return { stepIndex: Math.min(STEPS.length - 1, s.stepIndex + 1), committed: answersOf(s), buffer: null };
    case 'back':
      return { ...s, stepIndex: Math.max(0, s.stepIndex - 1) };
  }
}
