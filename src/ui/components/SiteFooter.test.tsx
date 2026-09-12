// @vitest-environment jsdom
//
// The footer shows the SAME disclaimer string as the intro modal (src/content/introSlides.ts's
// INTRO_DISCLAIMER, reused never reworded), so it has to read the owner's asterisks the same way.
// This file asserts that at the RENDER; the mark rules themselves are src/ui/intro/emphasis.test.ts.
//
// NO PHRASE IS NAMED HERE. The owner rewrites this sentence in the design editor while agents are
// working -- he dropped one of its two pairs mid-task on 2026-09-11 -- so the test asserts what
// must hold whatever he writes: no mark reaches the screen, and every bold phrase is one he
// wrapped. A named phrase would report his edit as a defect.
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SiteFooter } from './SiteFooter';
import { INTRO_DISCLAIMER } from '../../content/introSlides';
import { installFakeStorage } from '../../store/testStorage';

beforeEach(() => {
  installFakeStorage();
});

describe('SiteFooter', () => {
  it('renders the disclaimer marks as bold and shows no asterisk', () => {
    expect(INTRO_DISCLAIMER).toContain('*'); // The premise: there is a pair to render.

    const { container } = render(<SiteFooter />);
    const footer = container.querySelector('.site-footer');
    expect(footer?.textContent ?? '').not.toContain('*');

    const bold = Array.from(footer?.querySelectorAll('strong') ?? []).map((node) => node.textContent ?? '');
    expect(bold.length).toBeGreaterThan(0);
    for (const phrase of bold) {
      const wrapped = INTRO_DISCLAIMER.includes(`**${phrase}**`) || INTRO_DISCLAIMER.includes(`*${phrase}*`);
      expect(wrapped).toBe(true);
    }
  });
});
