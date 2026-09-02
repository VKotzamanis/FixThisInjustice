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

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { copy } from '../../content/copy';
import { SpotlightButton } from './SpotlightButton';

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
