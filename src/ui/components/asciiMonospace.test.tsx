// src/ui/components/asciiMonospace.test.tsx
//
// ASCII art lines up only in a face whose every glyph has one advance width (stylize survey items
// 3 and 9). The app's --mono is Archivo, which is proportional, and `.boot-pre` and `.konami-art`
// set `font: inherit`, so their boxes and dotted leaders rendered ragged. Every ASCII block now
// carries `ll-ascii`, whose one rule (tokens.css) names a true monospace stack and no web font.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import tokens from '../styles/tokens.css?raw';
import { Boot } from './Boot';
import { KonamiOverlay } from './KonamiOverlay';
import { PhaseTransition } from './PhaseTransition';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { makeAppState, makeUiPrefs } from '../../test/funFixtures';

/** The stack the brief fixed: system monospace faces only, nothing downloaded. */
const STACK = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

beforeEach(() => {
  installFakeStorage();
  vi.useFakeTimers();
  useAppStore.setState(makeAppState({ ui: makeUiPrefs({ bootSeen: false, skin: 'limelight' }) }));
});

describe('ASCII blocks use a true monospace face', () => {
  it('marks the boot print, the Konami box and the cutscene picture', () => {
    render(<Boot />);
    render(<KonamiOverlay onClose={() => undefined} />);
    render(
      <PhaseTransition
        fromIndex={0}
        toIndex={1}
        stats={{ sessionsCompleted: 20, setsLogged: 240, tonnageKg: 61_234, specimensOwned: 3 }} // [sessions], [sets], [kg], [cards]
        units="metric"
        onClose={() => undefined}
      />,
    );
    const blocks = [
      screen.getByTestId('boot-text'),
      document.querySelector('.konami-art'),
      document.querySelector('.pt-art'),
    ];
    for (const block of blocks) {
      expect(block?.tagName).toBe('PRE');
      expect(block?.classList.contains('ll-ascii')).toBe(true);
    }
  });

  it('defines the class once, as the system stack, above any single-class rule', () => {
    const css = tokens.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /\.ll-ascii\b/.test(m[1] ?? ''));
    expect(rules).toHaveLength(1);
    // `pre.ll-ascii` is 0,1,1: it outranks `.boot-pre` and `.konami-art` (0,1,0, each setting
    // `font: inherit`) whichever stylesheet the bundle happens to load last.
    expect(rules[0]?.[1]?.trim()).toBe('pre.ll-ascii');
    expect(rules[0]?.[2]).toContain(`font-family: ${STACK};`);
    expect(rules[0]?.[2]).not.toMatch(/Archivo|var\(--mono\)/);
  });
});
