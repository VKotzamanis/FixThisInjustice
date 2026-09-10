// @vitest-environment jsdom
/**
 * THE CASE THIS WHOLE WIDENING EXISTS FOR, against the real `IntroSequence`.
 *
 * `src/design/CopyEditLayer.test.tsx` renders the slide text statically, which proves the layer
 * recognises it. It does not prove the INTRO is editable, and two things about that screen could
 * each defeat the tool on their own:
 *
 *   1. the body types itself out one character at a time, so for most of a slide's life the text
 *      on screen is a PREFIX of the stored string and must not be editable;
 *   2. the slide is a `<section onClick={advance}>` with a `window` keydown listener that turns
 *      the page on ANY key. Without the layer stopping those, tapping a sentence would turn the
 *      page and typing a single character would turn it again.
 *
 * Both are asserted here, through the component the app actually renders.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { INTRO_CHAR_INTERVAL_MS, IntroSequence } from '../ui/intro/IntroSequence';
import { INTRO_SLIDES } from '../content/introSlides';
import { useAppStore } from '../store';
import { installFakeStorage } from '../store/testStorage';
import { makeUiPrefs } from '../test/funFixtures';
import { DesignGate } from './DesignGate';
import { setCopyKeyMarking } from './copyMarkers';

function setSearch(search: string): void {
  window.history.replaceState({}, '', `/${search}`);
}

/** Runs the typing timers out and lets the layer's observer see the finished text. */
async function typeOut(characters: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime((characters + 4) * INTRO_CHAR_INTERVAL_MS);
    await Promise.resolve();
  });
}

beforeEach(() => {
  installFakeStorage();
  vi.useFakeTimers();
  useAppStore.setState({ ui: makeUiPrefs({ introSeen: false, skin: 'clinical' }) });
  setSearch('?design=1');
  setCopyKeyMarking(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setSearch('');
  setCopyKeyMarking(false);
});

describe('the intro, in design mode', () => {
  it('is not editable while it is still typing, and is once it has finished', async () => {
    render(
      <>
        <IntroSequence />
        <DesignGate />
      </>,
    );
    const lead = INTRO_SLIDES[0]?.lead ?? '';
    expect(lead.length).toBeGreaterThan(20);

    // A tenth of the way through. Half a sentence is not the row.
    await typeOut(Math.floor(lead.length / 10));
    const body = screen.getByTestId('intro-body');
    expect(body.getAttribute('data-r10-editable')).not.toBe('true');

    await typeOut(lead.length);
    expect(body.textContent).toBe(lead);
    expect(body.getAttribute('data-r10-field')).toBe('introSlides:INTRO_SLIDES.0.lead');
    expect(body.getAttribute('data-r10-editable')).toBe('true');
    expect(body.getAttribute('contenteditable')).toBe('plaintext-only');
  });

  it('does not turn the page when a key is pressed inside the text being edited', async () => {
    render(
      <>
        <IntroSequence />
        <DesignGate />
      </>,
    );
    const lead = INTRO_SLIDES[0]?.lead ?? '';
    await typeOut(lead.length);

    const body = screen.getByTestId('intro-body');
    fireEvent.focusIn(body);
    fireEvent.keyDown(body, { key: 'a' });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    // Still slide 1: the heading of slide 2 has not appeared.
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByTestId('intro-body').textContent).toBe(lead);
  });

  it('does not turn the page when the text is TAPPED, which is how a phone reaches it', async () => {
    render(
      <>
        <IntroSequence />
        <DesignGate />
      </>,
    );
    const lead = INTRO_SLIDES[0]?.lead ?? '';
    await typeOut(lead.length);

    fireEvent.click(screen.getByTestId('intro-body'));
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('still turns the page on a tap OUTSIDE the text, so the intro is not a trap', async () => {
    render(
      <>
        <IntroSequence />
        <DesignGate />
      </>,
    );
    await typeOut((INTRO_SLIDES[0]?.lead ?? '').length);

    const section = document.querySelector('.intro');
    if (section !== null) fireEvent.click(section);
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(screen.getByRole('heading').textContent).toBe(INTRO_SLIDES[1]?.heading);
  });

  it('still turns the page on a key pressed outside the text', async () => {
    render(
      <>
        <IntroSequence />
        <DesignGate />
      </>,
    );
    await typeOut((INTRO_SLIDES[0]?.lead ?? '').length);

    fireEvent.keyDown(window, { key: 'a' });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(screen.getByRole('heading').textContent).toBe(INTRO_SLIDES[1]?.heading);
  });

  it('gives a bullet’s lead and its rest an element each, so both can be edited', async () => {
    render(
      <>
        <IntroSequence />
        <DesignGate />
      </>,
    );
    // Slide 2 is the first with bullets.
    fireEvent.keyDown(window, { key: 'a' });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    const slide = INTRO_SLIDES[1];
    const budget = [
      slide?.lead ?? '',
      ...(slide?.bullets ?? []).map((b) => (b.rest === null ? b.lead : `${b.lead}: ${b.rest}`)),
    ].join('\n').length;
    await typeOut(budget);

    const fields = [...document.querySelectorAll('[data-r10-field]')].map((node) =>
      node.getAttribute('data-r10-field'),
    );
    expect(fields).toContain('introSlides:INTRO_SLIDES.1.bullets.0.lead');
    expect(fields).toContain('introSlides:INTRO_SLIDES.1.bullets.0.rest');
    // The rendered sentence is unchanged by the extra element.
    const bullet = document.querySelector('.intro-bullets li');
    expect(bullet?.textContent).toBe(`${slide?.bullets[0]?.lead ?? ''}: ${slide?.bullets[0]?.rest ?? ''}`);
  });
});
