// @vitest-environment jsdom
//
// P4 Task 8. Cues are looked up by Exercise.id, never by display name, so the silent
// name-key drift of content review section 6 cannot recur here either.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { useFormCuesModal } from './FormCuesModal';
import { TrainingModalsProvider } from './TrainingModalsProvider';
import { copy } from '../../content/copy';
import { FORM_CUES, WARMUP_NOTICE } from '../../content/formCues';
import type { FormCue } from '../../content/formCues';

/** The shipped cue for an id, so a rename in formCues.ts fails here rather than silently. */
function cueFor(id: string): FormCue {
  const cue = FORM_CUES[id];
  if (cue === undefined) throw new Error(`formCues.ts no longer defines ${id}`);
  return cue;
}

function Opener(props: { exerciseId: string; title: string }): ReactElement {
  const modal = useFormCuesModal();
  return (
    <button
      type="button"
      onClick={() => {
        modal.open({ exerciseId: props.exerciseId, title: props.title });
      }}
    >
      open
    </button>
  );
}

function renderWith(exerciseId: string, title: string): void {
  render(
    <TrainingModalsProvider>
      <Opener exerciseId={exerciseId} title={title} />
    </TrainingModalsProvider>,
  );
}

function openFrom(): HTMLElement {
  const opener = screen.getByText('open');
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe('FormCuesModal', () => {
  it('renders nothing until it is opened', () => {
    renderWith('barbell-back-squat', 'Barbell back squat');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the warm-up notice first, then every cue section', () => {
    const cue = cueFor('barbell-bench-press');
    renderWith('barbell-bench-press', 'Barbell bench press');
    openFrom();

    const dialog = screen.getByRole('dialog');
    const text = dialog.textContent ?? '';
    // The notice is above the first section heading, not appended at the end.
    expect(text.indexOf(WARMUP_NOTICE)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(WARMUP_NOTICE)).toBeLessThan(text.indexOf(copy('label.cueSetup')));

    expect(screen.getByText(copy('label.cueSetup'))).toBeTruthy();
    expect(screen.getByText(copy('label.cueExecution'))).toBeTruthy();
    expect(screen.getByText(copy('label.cueMistakes'))).toBeTruthy();
    for (const line of [...cue.setup, ...cue.execution, ...cue.mistakes]) {
      expect(screen.getByText(line)).toBeTruthy();
    }
    expect(cue.tip).not.toBeNull();
    if (cue.tip !== null) expect(text).toContain(cue.tip);
  });

  it('renders the caution for the one cue that carries it', () => {
    const cue = cueFor('barbell-back-squat');
    expect(cue.caution).not.toBeNull();
    renderWith('barbell-back-squat', 'Barbell back squat');
    openFrom();
    const caution = screen.getByRole('note');
    expect(caution.textContent ?? '').toContain(cue.caution ?? '');
  });

  it('omits the caution where the cue carries none', () => {
    expect(cueFor('barbell-bench-press').caution).toBeNull();
    renderWith('barbell-bench-press', 'Barbell bench press');
    openFrom();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('says so rather than rendering nothing when an id has no cue', () => {
    renderWith('db-overhead-press', 'Dumbbell overhead press');
    openFrom();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(copy('advice.noFormCues'))).toBeTruthy();
    expect(screen.queryByText(copy('label.cueSetup'))).toBeNull();
  });

  it('closes on Escape and returns focus to the opener', () => {
    renderWith('barbell-back-squat', 'Barbell back squat');
    const opener = openFrom();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
