// src/ui/setup/activitySlider.test.tsx
//
// The nine-stop activity slider's READOUT, and nothing else.
//
// WHY THIS IS ITS OWN FILE rather than another block in SetupWizard.test.tsx: that file is over
// three thousand lines and was being edited by another brief when this defect was found. A focused
// file also states the property plainly, which is the point here.
//
// THE DEFECT THIS EXISTS TO PREVENT. Brief G widened the control from three positions to nine,
// three per FAO/WHO/UNU 2004 band, but left the readout rendering only the BAND name. Three
// consecutive stops therefore printed the same word and the "Examples" disclosure printed the same
// three-line list whatever was selected, so moving between the stops INSIDE a band changed nothing
// a user could see: six of the nine positions were indistinguishable from a neighbour. A stop the
// user cannot tell apart from its neighbour is not a stop, and nine of them is a slider that lies
// about its own resolution.
//
// src/content/setupSliderExamples.test.ts holds the DATA half of this gate: that every stop has a
// sentence and that the nine are distinct. This file holds the BEHAVIOURAL half: that the sentence
// actually reaches the screen and actually changes when the position does. The data half passing
// while this one fails is exactly the state the defect shipped in.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SetupWizard } from './SetupWizard';
import { useAppStore } from '../../store';
import { ACTIVITY_STOPS } from '../../domain/nutrition';
import { ACTIVITY_STOP_EXAMPLES } from '../../content/setupSliderExamples';

/** Any fixed instant. Nothing here reads the clock; the wizard's own steps do. */
const FIXED_NOW = Date.UTC(2026, 8, 9, 12, 0, 0);

beforeEach(() => {
  // `setTimeout` is faked too because SetupWizard debounces its draft save by 400 ms; without
  // it the store assertion below would race a real timer.
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(FIXED_NOW);
  useAppStore.getState().wipeAll();
  useAppStore.setState((s) => ({ ui: { ...s.ui, skin: 'clinical' } }));
});

afterEach(() => {
  vi.useRealTimers();
});

function next(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
}

function setValue(label: RegExp | string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** A fresh metric wizard, advanced to the training step with minimal valid body data. */
function toTrainingStep(): void {
  render(<SetupWizard />);
  next(); // units: metric is the default
  setValue(/^time zone$/i, 'America/New_York');
  next();
  fireEvent.click(screen.getByLabelText('Male'));
  setValue(/^age \(years\)$/i, '30');
  setValue(/^metres$/i, '1');
  setValue(/^centimetres$/i, '80');
  setValue(/body mass \(kg\)/i, '80');
  next();
}

/** The activity slider itself. */
function slider(): HTMLElement {
  return screen.getByLabelText(/everyday activity|^activity/i);
}

/** Drag the slider to a raw index and return the readout's full text. */
function readoutAt(index: number): string {
  fireEvent.change(slider(), { target: { value: String(index) } });
  const el = document.querySelector('.wiz-slider-position');
  expect(el, 'the slider readout should be on screen').not.toBeNull();
  return el?.textContent ?? '';
}

describe('the nine-stop activity slider readout', () => {
  it('offers exactly nine positions, one per ACTIVITY_STOPS entry', () => {
    toTrainingStep();
    expect(slider()).toHaveAttribute('min', '0');
    expect(slider()).toHaveAttribute('max', String(ACTIVITY_STOPS.length - 1));
    expect(slider()).toHaveAttribute('step', '1');
  });

  /*
   * THE ASSERTION THAT WOULD HAVE CAUGHT THE DEFECT. Stops 0, 1 and 2 are all `sedentary`, so a
   * readout showing only the band prints the same string three times. Every one of the nine must
   * differ from every other.
   */
  it('prints a DIFFERENT readout at every one of the nine positions', () => {
    toTrainingStep();
    const seen = new Map<string, number[]>();
    ACTIVITY_STOPS.forEach((_stop, i) => {
      const text = readoutAt(i);
      const at = seen.get(text) ?? [];
      at.push(i);
      seen.set(text, at);
    });
    const collisions = [...seen.entries()]
      .filter(([, positions]) => positions.length > 1)
      .map(([text, positions]) => `positions ${positions.join(',')} both read "${text}"`);
    expect(collisions).toEqual([]);
    expect(seen.size).toBe(ACTIVITY_STOPS.length);
  });

  it('prints the selected stop own sentence, verbatim from the examples module', () => {
    toTrainingStep();
    ACTIVITY_STOPS.forEach((stop, i) => {
      const expected = ACTIVITY_STOP_EXAMPLES[stop.pal];
      expect(expected, `no example for PAL ${String(stop.pal)}`).toBeTruthy();
      expect(readoutAt(i)).toContain(expected ?? '@@missing@@');
    });
  });

  /*
   * The band still has to be there. It names the FAO/WHO/UNU category the PAL is drawn from, and
   * dropping it to fix the collision would trade one defect for another: the user would see a
   * description with no indication of which published band it sits in.
   */
  it('still names the band alongside the sentence', () => {
    toTrainingStep();
    expect(readoutAt(0).toLowerCase()).toContain('sedentary');
    expect(readoutAt(4).toLowerCase()).toContain('moderate');
    expect(readoutAt(8).toLowerCase()).toContain('vigorous');
  });

  /* Moving the slider must write BOTH the band and the stop, never one without the other. */
  it('stores the band and the PAL together', () => {
    toTrainingStep();
    ACTIVITY_STOPS.forEach((stop, i) => {
      fireEvent.change(slider(), { target: { value: String(i) } });
      /*
       * The draft is two-tier (brief K, r2.11): the committed answers sit at the TOP level of
       * SetupDraft and `buffer` holds the step in progress, so an uncommitted slider move lands
       * in the buffer and the committed value lags until Next. Read the buffer first and fall
       * back, which is what `draft = buffer ?? committed` does in the wizard itself.
       *
       * The save is debounced by SETUP_DRAFT_SAVE_DEBOUNCE_MS (400 ms), so the timer has to be
       * run out before the store holds anything at all.
       */
      act(() => {
        vi.advanceTimersByTime(500);
      });
      const draft = useAppStore.getState().setupDraft;
      expect(draft?.buffer?.activityPal ?? draft?.activityPal).toBe(stop.pal);
      expect(draft?.buffer?.activity ?? draft?.activity).toBe(stop.level);
    });
  });
});
