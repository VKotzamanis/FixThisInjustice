// @vitest-environment jsdom
//
// The intro sequence (P10 Brief C). Modelled on src/ui/components/Boot.test.tsx, which asserts
// the identical timed-reveal, any-key, reduced-motion and gate shapes this file reuses; the two
// behaviours the brief makes genuinely different from Boot -- a tap ADVANCES rather than
// finishes, and the fade is CSS rather than component state -- get their own tests below.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  INTRO_CHAR_INTERVAL_MS,
  IntroGate,
  IntroSequence,
} from './IntroSequence';
import { INTRO_SLIDES } from '../../content/introSlides';
import { copy } from '../../content/copy';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { makeUiPrefs } from '../../test/funFixtures';

function introBody(): string {
  return screen.getByTestId('intro-body').textContent ?? '';
}

beforeEach(() => {
  installFakeStorage();
  vi.useFakeTimers();
  useAppStore.setState({ ui: makeUiPrefs({ introSeen: false, skin: 'clinical' }) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('IntroSequence', () => {
  it('types the first slide out one character at a time', () => {
    render(<IntroSequence />);
    expect(introBody()).toBe('');

    act(() => {
      vi.advanceTimersByTime(INTRO_CHAR_INTERVAL_MS);
    });
    expect(introBody()).toHaveLength(1);
    expect(introBody()).toBe(INTRO_SLIDES[0]?.body.slice(0, 1));

    const full = INTRO_SLIDES[0]?.body ?? '';
    act(() => {
      vi.advanceTimersByTime(INTRO_CHAR_INTERVAL_MS * full.length);
    });
    expect(introBody()).toBe(full);
  });

  it('renders no heading on slide 1, which the brief gives none', () => {
    render(<IntroSequence />);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('shows the ascii figure and the click-to-continue line on slides 1 to 4, not on 5 or 6', () => {
    const { container } = render(<IntroSequence />);
    const key = () => {
      fireEvent.keyDown(window, { key: 'a' });
    };

    // Slide 1 (index 0).
    expect(container.querySelector('.intro-figure')).not.toBeNull();
    expect(screen.getByText(`${copy('advice.clickToContinue')}...`)).toBeInTheDocument();

    key(); // -> slide 2
    expect(container.querySelector('.intro-figure')).not.toBeNull();
    key(); // -> slide 3
    expect(container.querySelector('.intro-figure')).not.toBeNull();
    key(); // -> slide 4
    expect(container.querySelector('.intro-figure')).not.toBeNull();

    key(); // -> slide 5, the disclaimer
    expect(container.querySelector('.intro-figure')).toBeNull();
    expect(screen.queryByText(`${copy('advice.clickToContinue')}...`)).toBeNull();
    // The slow pulse the brief names, applied to this slide and no other.
    expect(container.querySelector('.intro-pulse')).not.toBeNull();

    key(); // -> slide 6
    expect(container.querySelector('.intro-figure')).toBeNull();
    expect(container.querySelector('.intro-pulse')).toBeNull();
  });

  it('advances one slide per key press, rather than finishing the sequence', () => {
    render(<IntroSequence />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByRole('heading')).toHaveTextContent(INTRO_SLIDES[1]?.heading ?? '');
    expect(useAppStore.getState().ui.introSeen).toBe(false);
  });

  it('advances one slide per tap anywhere on the section, interrupting the typing', () => {
    render(<IntroSequence />);
    act(() => {
      vi.advanceTimersByTime(INTRO_CHAR_INTERVAL_MS * 3); // partway through slide 1
    });
    expect(introBody().length).toBeGreaterThan(0);
    expect(introBody().length).toBeLessThan(INTRO_SLIDES[0]?.body.length ?? 0);

    fireEvent.click(screen.getByTestId('intro-body'));
    expect(screen.getByRole('heading')).toHaveTextContent(INTRO_SLIDES[1]?.heading ?? '');
    expect(introBody()).toBe(''); // the new slide starts its own type-out at zero
    expect(useAppStore.getState().ui.introSeen).toBe(false);
  });

  it('finishes and records introSeen once a tap advances past the last slide', () => {
    render(<IntroSequence />);
    // Five taps: slide 1 -> 2 -> 3 -> 4 -> 5 -> 6. A sixth finishes it.
    for (let i = 0; i < 5; i += 1) fireEvent.keyDown(window, { key: 'a' });
    expect(useAppStore.getState().ui.introSeen).toBe(false);

    fireEvent.keyDown(window, { key: 'a' });
    expect(useAppStore.getState().ui.introSeen).toBe(true);
  });

  it('skips to the end from the very first slide, without advancing through the rest', () => {
    render(<IntroSequence />);
    fireEvent.click(screen.getByRole('button', { name: copy('button.skipIntro') }));

    expect(useAppStore.getState().ui.introSeen).toBe(true);
    // The tap on Skip did not ALSO bubble into the section's advance handler: slide 1's own
    // heading-less body is still what is on screen, not slide 2's.
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('skips to the end from a later slide the same way', () => {
    render(<IntroSequence />);
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'a' }); // slide 3

    fireEvent.click(screen.getByRole('button', { name: copy('button.skipIntro') }));
    expect(useAppStore.getState().ui.introSeen).toBe(true);
  });

  it('prints the whole slide at once, with no timer, under prefers-reduced-motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
    render(<IntroSequence />);
    expect(introBody()).toBe(INTRO_SLIDES[0]?.body);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no timer behind when it is unmounted mid-type', () => {
    const { unmount } = render(<IntroSequence />);
    act(() => {
      vi.advanceTimersByTime(INTRO_CHAR_INTERVAL_MS * 2);
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no timer behind when a tap replaces a slide mid-type', () => {
    render(<IntroSequence />);
    act(() => {
      vi.advanceTimersByTime(INTRO_CHAR_INTERVAL_MS * 2);
    });
    fireEvent.click(screen.getByTestId('intro-body'));
    // The old slide's pending character timers are cleared by the effect's own cleanup; only
    // the new slide's timers remain pending.
    const remaining = INTRO_SLIDES[1]?.body.length ?? 0;
    expect(vi.getTimerCount()).toBe(remaining);
  });
});

describe('IntroGate', () => {
  it('mounts the sequence while the intro has not been seen', () => {
    render(<IntroGate />);
    expect(screen.getByTestId('intro-body')).toBeInTheDocument();
  });

  it('renders nothing at all once the intro has been seen', () => {
    useAppStore.setState({ ui: makeUiPrefs({ introSeen: true }) });
    const { container } = render(<IntroGate />);
    expect(container.firstChild).toBeNull();
  });

  it('unmounts the sequence as soon as Skip records it as seen', () => {
    render(<IntroGate />);
    fireEvent.click(screen.getByRole('button', { name: copy('button.skipIntro') }));
    expect(screen.queryByTestId('intro-body')).toBeNull();
  });
});
