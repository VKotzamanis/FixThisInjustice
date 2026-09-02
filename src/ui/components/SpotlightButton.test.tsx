// src/ui/components/SpotlightButton.test.tsx
//
// The tap target that opens the palette. It exists because SPOTLIGHT_COMBO cannot be pressed on
// a phone, so the assertions here are the two facts that make it usable on one: it carries an
// accessible name, and pressing it calls back. Nothing else is asserted, because nothing else
// is the button's: the palette's own behaviour is Spotlight.test.tsx's.
//
// The name is quoted from src/content/copy.ts rather than written out (copy contract: "test
// assertions quote the default table"), so a reworded label fails in the copy suite and not
// here.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { copy, copyFor } from '../../content/copy';
import { SpotlightButton } from './SpotlightButton';
import { useAppStore } from '../../store';
import type { SkinId } from '../../domain/types';

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

describe('SpotlightButton', () => {
  it('renders a button whose accessible name is the copy table entry', () => {
    render(<SpotlightButton onOpen={() => {}} />);
    const button = screen.getByRole('button', { name: copy('button.openSpotlight') });

    // type="button", not the default "submit": the control sits in the shell, and a stray
    // submit inside any future form would reload the page instead of opening the palette.
    expect(button.getAttribute('type')).toBe('button');
  });

  it('calls onOpen once when it is pressed', () => {
    const onOpen = vi.fn();
    render(<SpotlightButton onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: copy('button.openSpotlight') }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

/*
 * P8 Task 16: the words come from the copy table through `useCopy()`, so `ui.skin` decides
 * them. Asserted by KEY through `copyFor`, never as a literal, so the expectation follows the
 * table instead of having to be rewritten beside it.
 */
describe('SpotlightButton under a skin', () => {
  it('takes its name from the limelight table, and from the default one under clinical', () => {
    pinSkin('limelight');
    const view = render(<SpotlightButton onOpen={() => {}} />);
    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.openSpotlight') }),
    ).toBeInTheDocument();
    view.unmount();

    pinSkin('clinical');
    render(<SpotlightButton onOpen={() => {}} />);
    expect(
      screen.getByRole('button', { name: copyFor('clinical', 'button.openSpotlight') }),
    ).toBeInTheDocument();
  });
});
