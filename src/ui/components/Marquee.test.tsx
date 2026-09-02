import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Marquee } from './Marquee';
import type { MarqueeItem } from './Marquee';
// Imported for its side effect, the way App.test.tsx imports crt.css: vitest injects the sheets
// its `css.include` matches, and the reduced-motion suite below reads the injected text because
// jsdom evaluates no media query.
import './limelight.css';
import { useAppStore } from '../../store';
import { makeAppState, makeUiPrefs } from '../../test/funFixtures';
import type { SkinId } from '../../domain/types';

/**
 * Two items, both already formatted by a FORMAT frame at the call site. The marquee never builds
 * a string: it places one, so a number can never be restated here.
 */
const ITEMS: readonly MarqueeItem[] = [
  { icon: 'barbellPanel', text: 'Session 12 of 48' },
  { icon: 'crownPanel', text: 'Weekly target met. 4 of 4 sessions completed.' },
];

const LABEL = 'Pause the ticker';

/** Puts one skin in the store, which is the single source of truth useSkin() reads. */
function withSkin(skin: SkinId): void {
  useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin }) }));
}

beforeEach(() => {
  withSkin('limelight');
});

describe('Marquee', () => {
  it('renders nothing on the clinical skin, which carries no ticker', () => {
    withSkin('clinical');
    render(<Marquee items={ITEMS} label={LABEL} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing when it has no items', () => {
    render(<Marquee items={[]} label={LABEL} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('doubles the item list on limelight, so the translate loop is seamless', () => {
    render(<Marquee items={ITEMS} label={LABEL} />);
    expect(screen.getByRole('button', { name: LABEL })).toBeTruthy();
    expect(document.querySelectorAll('.ll-marquee-item')).toHaveLength(ITEMS.length * 2);
    // The pixel art is limelight's alone; the item text is not.
    expect(document.querySelectorAll('img.ll-icon').length).toBeGreaterThan(0);
  });

  it('renders on the board skin with the same words and none of the art', () => {
    withSkin('board');
    render(<Marquee items={ITEMS} label={LABEL} />);
    expect(screen.getByRole('button', { name: LABEL })).toBeTruthy();
    expect(document.querySelectorAll('.ll-marquee-item')).toHaveLength(ITEMS.length * 2);
    expect(document.querySelectorAll('img.ll-icon')).toHaveLength(0);
  });

  it('hides the moving copy from assistive technology and states the words once', () => {
    render(<Marquee items={ITEMS} label={LABEL} />);
    expect(document.querySelector('.ll-marquee-track')?.getAttribute('aria-hidden')).toBe('true');

    const statics = document.querySelectorAll('.ll-marquee-static .ll-marquee-line');
    expect(statics).toHaveLength(ITEMS.length);
    expect([...statics].map((node) => node.textContent)).toEqual(ITEMS.map((item) => item.text));
    // The static line is outside the button, so the button's own name stays the label alone.
    expect(screen.getByRole('button', { name: LABEL }).querySelector('.ll-marquee-static')).toBeNull();
  });

  it('latches paused on activation and unlatches on the next one', () => {
    render(<Marquee items={ITEMS} label={LABEL} />);
    const strip = screen.getByRole('button', { name: LABEL });
    expect(strip.getAttribute('aria-pressed')).toBe('false');
    expect(strip.getAttribute('data-paused')).toBe('false');

    fireEvent.click(strip);
    expect(strip.getAttribute('aria-pressed')).toBe('true');
    expect(strip.getAttribute('data-paused')).toBe('true');

    fireEvent.click(strip);
    expect(strip.getAttribute('aria-pressed')).toBe('false');
    expect(strip.getAttribute('data-paused')).toBe('false');
  });

  it('stops the animation and shows one line under prefers-reduced-motion', () => {
    // The rule is CSS, so it is asserted in the injected stylesheet text: jsdom evaluates no
    // media query, and App.test.tsx asserts crt.css's own reduced-motion rule the same way.
    const stylesheet = [...document.querySelectorAll('style')]
      .map((node) => node.textContent ?? '')
      .join('\n');
    const at = stylesheet.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(at).toBeGreaterThanOrEqual(0);
    const reduced = stylesheet.slice(at);
    expect(reduced).toMatch(/\.ll-marquee-track\s*\{[^}]*animation:\s*none/);
    expect(reduced).toMatch(/\.ll-marquee-item\s*~\s*\.ll-marquee-item\s*\{[^}]*display:\s*none/);
  });
});
