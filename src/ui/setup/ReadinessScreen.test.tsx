import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { copy, copyFor } from '../../content/copy';
import { READINESS_QUESTIONS, READINESS_SOURCE } from '../../content/readinessQuestions';
import { ReadinessScreen } from './ReadinessScreen';
import { useAppStore } from '../../store';
import type { SkinId } from '../../domain/types';

/**
 * The seven General Health Questions of the official PAR-Q+ 2025 form, present here ONLY as an
 * exclusion list.
 *
 * Master plan section 10.4 (decision `readiness-screen-own-wording`): the form is "all rights
 * reserved" and no reproduction permission has been obtained, so this app asks the same seven
 * screening domains in its own words. These strings are what the shipped questions must NOT be.
 * A test that asserts equality against them would be the thing the decision forbids; this one
 * asserts inequality, so a later edit that quietly pastes the form back in fails here.
 */
const PARQ_PLUS_2025_SENTENCES: readonly string[] = [
  'Has your doctor ever said that you have a heart condition OR high blood pressure?',
  'Do you feel pain in your chest at rest, during your daily activities of living, OR when you do physical activity?',
  'Do you lose balance because of dizziness OR have you lost consciousness in the last 12 months?',
  'Have you ever been diagnosed with another chronic medical condition (other than heart disease or high blood pressure)?',
  'Are you currently taking prescribed medications for a chronic medical condition?',
  'Do you currently have (or have had within the past 12 months) a bone, joint, or soft tissue (muscle, ligament, or tendon) problem that could be made worse by becoming more physically active?',
  'Has your doctor ever said that you should only do medically supervised physical activity?',
];

/** R3 in the copy contract caps advice at 12 words; a screening question is capped at 20. */
const MAX_QUESTION_WORDS = 20;

const YES = copy('label.yes');
const NO = copy('label.no');

beforeEach(() => {
  // Only Date is faked: Testing Library's own scheduling must keep its real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
});

/** Answer every question with the given choice. */
function answerAll(choice: string): void {
  for (const q of READINESS_QUESTIONS) {
    fireEvent.click(within(screen.getByTestId(`readiness-q${q.id}`)).getByLabelText(choice));
  }
}

function words(text: string): number {
  return text.trim().split(/\s+/).length;
}

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

describe('READINESS_QUESTIONS', () => {
  it('asks seven questions, numbered one to seven', () => {
    expect(READINESS_QUESTIONS).toHaveLength(7);
    expect(READINESS_QUESTIONS.map((q) => q.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const q of READINESS_QUESTIONS) {
      expect(q.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps every question inside twenty words and uses no dash connector', () => {
    for (const q of READINESS_QUESTIONS) {
      expect(words(q.text)).toBeLessThanOrEqual(MAX_QUESTION_WORDS);
      // Copy contract R5: no em-dash or en-dash, in a question or in its note.
      expect(q.text).not.toMatch(/[—–]/);
      if (q.note !== null) expect(q.note).not.toMatch(/[—–]/);
    }
  });

  it('reproduces no sentence of the PAR-Q+ 2025 form', () => {
    for (const q of READINESS_QUESTIONS) {
      for (const sentence of PARQ_PLUS_2025_SENTENCES) {
        expect(q.text).not.toBe(sentence);
      }
    }
  });

  it('cites the paper without claiming a DOI', () => {
    expect(READINESS_SOURCE).toContain('Warburton DER');
    expect(READINESS_SOURCE).toContain('Health & Fitness Journal of Canada 4(2):3-23, 2011');
    expect(READINESS_SOURCE).toContain('DOI not verified');
    // No DOI may be invented: Crossref holds no record of this journal at all.
    expect(READINESS_SOURCE).not.toMatch(/10\.\d{4,9}\//);
  });
});

describe('ReadinessScreen', () => {
  it('renders all seven questions with a Yes and a No control each', () => {
    render(<ReadinessScreen timezone="Europe/Athens" onComplete={vi.fn()} />);
    for (const q of READINESS_QUESTIONS) {
      const group = screen.getByTestId(`readiness-q${q.id}`);
      expect(within(group).getByText(q.text)).toBeInTheDocument();
      expect(within(group).getByLabelText(YES)).toBeInTheDocument();
      expect(within(group).getByLabelText(NO)).toBeInTheDocument();
    }
  });

  it('collects no free text anywhere on the screen', () => {
    const { container } = render(<ReadinessScreen timezone="Europe/Athens" onComplete={vi.fn()} />);
    expect(container.querySelectorAll('textarea')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    const inputs = [...container.querySelectorAll('input')];
    expect(inputs).toHaveLength(14); // 7 questions x Yes/No
    expect(inputs.every((i) => i.getAttribute('type') === 'radio')).toBe(true);
  });

  it('gives every answer control the tap-target class the stylesheet sizes at 44 px', () => {
    const { container } = render(<ReadinessScreen timezone="Europe/Athens" onComplete={vi.fn()} />);
    // jsdom applies no imported stylesheet, so the class is what is asserted here and the
    // 2.75rem (44 px) and 16 px rules live in setup.css beside the wizard's own.
    expect(container.querySelectorAll('label.rq-answer')).toHaveLength(14);
  });

  it('states that this is not medical advice and what a yes means', () => {
    render(<ReadinessScreen timezone="Europe/Athens" onComplete={vi.fn()} />);
    expect(screen.getByText(copy('advice.notMedicalAdvice'))).toBeInTheDocument();
    expect(screen.getByText(copy('advice.readinessAnyYes'))).toBeInTheDocument();
  });

  it('keeps the citation and the model behind a why? disclosure', () => {
    render(<ReadinessScreen timezone="Europe/Athens" onComplete={vi.fn()} />);
    const summary = screen.getByText(copy('disclosure.why'));
    expect(summary.tagName).toBe('SUMMARY');
    const details = summary.closest('details');
    expect(details).not.toBeNull();
    expect(within(details as HTMLElement).getByText(READINESS_SOURCE)).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText(copy('why.readiness'))).toBeInTheDocument();
  });

  it('blocks Continue until all seven are answered', () => {
    render(<ReadinessScreen timezone="Europe/Athens" onComplete={vi.fn()} />);
    const button = screen.getByRole('button', { name: copy('button.continue') });
    expect(button).toBeDisabled();
    for (const q of READINESS_QUESTIONS.slice(0, 6)) {
      fireEvent.click(within(screen.getByTestId(`readiness-q${q.id}`)).getByLabelText(NO));
    }
    expect(button).toBeDisabled();
    fireEvent.click(within(screen.getByTestId('readiness-q7')).getByLabelText(NO));
    expect(button).toBeEnabled();
  });

  it('reports flagged false when every answer is no', () => {
    const onComplete = vi.fn();
    render(<ReadinessScreen timezone="Europe/Athens" onComplete={onComplete} />);
    answerAll(NO);
    fireEvent.click(screen.getByRole('button', { name: copy('button.continue') }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({ screenedAt: '2026-09-01', flagged: false });
  });

  it('reports flagged true when a single answer is yes', () => {
    const onComplete = vi.fn();
    render(<ReadinessScreen timezone="Europe/Athens" onComplete={onComplete} />);
    answerAll(NO);
    fireEvent.click(within(screen.getByTestId('readiness-q5')).getByLabelText(YES));
    fireEvent.click(screen.getByRole('button', { name: copy('button.continue') }));
    expect(onComplete).toHaveBeenCalledWith({ screenedAt: '2026-09-01', flagged: true });
  });

  it('dates the screening in the profile time zone, not UTC', () => {
    // 2026-09-01T02:00:00Z is 2026-09-01 in Athens and still 2026-08-31 in Los Angeles.
    vi.setSystemTime(new Date('2026-09-01T02:00:00Z'));
    const onComplete = vi.fn();
    render(<ReadinessScreen timezone="America/Los_Angeles" onComplete={onComplete} />);
    answerAll(NO);
    fireEvent.click(screen.getByRole('button', { name: copy('button.continue') }));
    expect(onComplete).toHaveBeenCalledWith({ screenedAt: '2026-08-31', flagged: false });
  });
});

/*
 * P8 Task 16: the words come from the copy table through `useCopy()`, so `ui.skin` decides
 * them. Asserted by KEY through `copyFor`, never as a literal, so the expectation follows the
 * table instead of having to be rewritten beside it.
 */
describe('ReadinessScreen under a skin', () => {
  it('names the control in the limelight words, and in the default ones under clinical', () => {
    pinSkin('limelight');
    const view = render(<ReadinessScreen timezone="Europe/Athens" onComplete={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.continue') }),
    ).toBeInTheDocument();
    view.unmount();

    pinSkin('clinical');
    render(<ReadinessScreen timezone="Europe/Athens" onComplete={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: copyFor('clinical', 'button.continue') }),
    ).toBeInTheDocument();
  });
});
