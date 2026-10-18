// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { INTRO_CHAR_INTERVAL_MS, IntroGate, IntroSequence } from './IntroSequence';
import { INTRO_DISCLAIMER, INTRO_SLIDES } from '../../content/introSlides';
import { copyFor } from '../../content/copy';
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
  useAppStore.setState({ ui: makeUiPrefs({ introSeen: false, skin: 'limelight' }) });
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
    const continueButton = screen.getByRole('button', { name: copyFor('limelight', 'button.continue') });
    expect(continueButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);
    expect(screen.getByRole('heading')).toHaveTextContent(INTRO_SLIDES[4]?.heading ?? '');
  });

  it('renders a marked word bold, showing no asterisk, part-typed and whole', () => {
    render(<IntroSequence />);
    // By content, not position: the owner reorders slides in the editor.
    const target = INTRO_SLIDES.findIndex((slide) => slide.lead?.includes('*habit*') ?? false);
    expect(target).toBeGreaterThan(0);
    for (let i = 0; i < target; i += 1) advance();
    const lead = INTRO_SLIDES[target]?.lead ?? '';

    // A prefix that stops INSIDE the marked word: the state every marked word types through.
    const cut = lead.indexOf('*habit*') + '*hab'.length;
    act(() => void vi.advanceTimersByTime(cut * INTRO_CHAR_INTERVAL_MS));
    const body = screen.getByTestId('intro-body');
    expect(body.textContent).not.toContain('*');
    expect(body.querySelector('strong')?.textContent).toBe('hab');

    act(() => void vi.advanceTimersByTime(lead.length * INTRO_CHAR_INTERVAL_MS));
    expect(body.textContent).not.toContain('*');
    expect(body.querySelector('strong')?.textContent).toBe('habit');
    expect(body.textContent).toContain('the habit of exercising');
    expect(body.textContent).toContain('~fun~'); // A tilde is not a mark.
  });

  it('renders the marked phrases of the disclaimer bold inside the modal', () => {
    const { container } = render(<IntroSequence />);
    for (let index = 0; index < 4; index += 1) advance();
    const warning = container.querySelector('.intro-modal-warning');
    expect(warning?.textContent).not.toContain('*');
    // The phrases are read back from the string, never named here: the owner rewrites this
    // sentence in the design editor, and a named phrase makes his edit look like a defect.
    const bold = Array.from(warning?.querySelectorAll('strong') ?? []).map((node) => node.textContent ?? '');
    expect(bold.length).toBeGreaterThan(0);
    for (const phrase of bold) {
      const wrapped = INTRO_DISCLAIMER.includes(`**${phrase}**`) || INTRO_DISCLAIMER.includes(`*${phrase}*`);
      expect(wrapped).toBe(true);
    }
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
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.continue') }));
    advance();
    expect(screen.queryByTestId('intro-body')).toBeNull();
  });
});
