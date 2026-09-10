// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { INTRO_CHAR_INTERVAL_MS, IntroGate, IntroSequence } from './IntroSequence';
import { INTRO_SLIDES } from '../../content/introSlides';
import { copy } from '../../content/copy';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { makeUiPrefs } from '../../test/funFixtures';

function introBody(): string {
  return screen.getByTestId('intro-body').textContent ?? '';
}

function advance(): void {
  fireEvent.keyDown(window, { key: 'a' });
  act(() => void vi.advanceTimersByTime(180));
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
  it('types the body while rendering the heading whole', () => {
    render(<IntroSequence />);
    expect(introBody()).toBe('');
    advance();
    expect(screen.getByRole('heading')).toHaveTextContent(INTRO_SLIDES[1]?.heading ?? '');
    expect(introBody()).toBe('');
    act(() => void vi.advanceTimersByTime(INTRO_CHAR_INTERVAL_MS));
    expect(introBody()).toHaveLength(1);
  });

  it('renders no control named Skip', () => {
    render(<IntroSequence />);
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull();
  });

  it('advances one slide per click or key press', () => {
    render(<IntroSequence />);
    fireEvent.click(screen.getByTestId('intro-body'));
    act(() => void vi.advanceTimersByTime(180));
    expect(screen.getByRole('heading')).toHaveTextContent(INTRO_SLIDES[1]?.heading ?? '');
    advance();
    expect(screen.getByRole('heading')).toHaveTextContent(INTRO_SLIDES[2]?.heading ?? '');
  });

  it('requires the acknowledgement checkbox before Continue is enabled', () => {
    render(<IntroSequence />);
    for (let index = 0; index < 4; index += 1) advance();
    const continueButton = screen.getByRole('button', { name: copy('button.continue') });
    expect(continueButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);
    expect(screen.getByRole('heading')).toHaveTextContent(INTRO_SLIDES[4]?.heading ?? '');
  });

  it('draws the visual-settings arrow on the final slide, and no earlier one', () => {
    render(<IntroSequence />);
    expect(screen.queryByTestId('intro-settings-pointer')).toBeNull();
    for (let index = 0; index < 4; index += 1) {
      advance();
      expect(screen.queryByTestId('intro-settings-pointer')).toBeNull();
    }
    // The 4th advance() opened the acknowledgement modal without changing slides (index still 3).
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: copy('button.continue') }));
    expect(screen.getByRole('heading')).toHaveTextContent(INTRO_SLIDES[4]?.heading ?? '');
    expect(screen.getByTestId('intro-settings-pointer')).toHaveTextContent(
      copy('label.changeVisualSettings'),
    );
  });

  it('does not apply animation under prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'), media: query,
      addEventListener: () => undefined, removeEventListener: () => undefined,
    })));
    const { container } = render(<IntroSequence />);
    expect(introBody()).toBe(INTRO_SLIDES[0]?.lead);
    expect(container.querySelector('.intro-no-motion')).not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('IntroGate', () => {
  it('mounts while unseen and unmounts after the last slide', () => {
    render(<IntroGate />);
    for (let index = 0; index < 4; index += 1) advance();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: copy('button.continue') }));
    advance();
    expect(screen.queryByTestId('intro-body')).toBeNull();
  });
});
