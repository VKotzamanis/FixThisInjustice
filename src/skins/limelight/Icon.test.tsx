import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DEFAULT_ICON_SIZE, ICON_FOR_KEY, Icon, SkinLabel } from './Icon';
import { LIMELIGHT_ICONS } from './icons';
import { copyFor } from '../../content/copy';
import { useAppStore } from '../../store';
import { makeAppState, makeUiPrefs } from '../../test/funFixtures';
import type { SkinId } from '../../domain/types';

/** Puts one skin in the store, which is the single source of truth useSkin() reads. */
function withSkin(skin: SkinId): void {
  useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin }) }));
}

// The shipped default, so the suites below that do not name a skin get the one that draws.
beforeEach(() => {
  withSkin('limelight');
});

/** The one img the component renders, found without going through the accessibility tree. */
function renderedIcon(container: HTMLElement): HTMLImageElement {
  const image = container.querySelector('img.ll-icon');
  expect(image).not.toBeNull();
  return image as HTMLImageElement;
}

describe('Icon', () => {
  it('renders the inlined pixel art as the img source', () => {
    const { container } = render(<Icon name="crown" />);
    expect(renderedIcon(container).getAttribute('src')).toBe(LIMELIGHT_ICONS.crown);
  });

  it('hides an unlabelled icon from the accessibility tree', () => {
    const { container } = render(<Icon name="sparkle" />);
    const image = renderedIcon(container);
    expect(image.getAttribute('aria-hidden')).toBe('true');
    expect(image.getAttribute('alt')).toBe('');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('exposes a labelled icon as an image with that name', () => {
    render(<Icon name="crown" label="personal record" />);
    const image = screen.getByRole('img', { name: 'personal record' });
    expect(image.getAttribute('aria-label')).toBe('personal record');
    expect(image.getAttribute('aria-hidden')).toBeNull();
  });

  it('defaults to the plan size in CSS px and takes an override', () => {
    const { container, rerender } = render(<Icon name="barbell" />);
    expect(renderedIcon(container).getAttribute('width')).toBe(String(DEFAULT_ICON_SIZE));
    expect(renderedIcon(container).getAttribute('height')).toBe(String(DEFAULT_ICON_SIZE));

    rerender(<Icon name="barbell" width={32} height={32} />);
    expect(renderedIcon(container).getAttribute('width')).toBe('32');
    expect(renderedIcon(container).getAttribute('height')).toBe('32');
  });

  it('asks the browser not to interpolate the 32 px art', () => {
    // Without this the 32 -> 20 px downscale is smoothed and the pixel edges blur.
    const { container } = render(<Icon name="skull" />);
    expect(renderedIcon(container).getAttribute('style')).toContain('image-rendering: pixelated');
  });

  it('rejects a name the generator did not emit, at compile time', () => {
    const { container } = render(
      <Icon
        // @ts-expect-error 'unicorn' is not a LimelightIconName; there is no runtime fallback either
        name="unicorn"
      />,
    );
    // No emoji fallback and no placeholder: an unknown name yields an img with no source at all,
    // which is why the type error above is the real guard.
    expect(renderedIcon(container).getAttribute('src')).toBeNull();
  });
});

/**
 * The skin gate (P8 Task 12). The icon set belongs to one skin: clinical is deliberately
 * emoji-free and glyph-free (copy contract R6), and direction H ships no graphic at all, its
 * whole character being type and motion. So the component returns null off limelight and a call
 * site never has to ask which skin is active.
 */
describe('Icon off the limelight skin', () => {
  it('renders nothing on the clinical skin', () => {
    withSkin('clinical');
    const { container } = render(<Icon name="crown" label="personal record" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('img.ll-icon')).toBeNull();
  });

  it('renders nothing on the board skin', () => {
    withSkin('board');
    const { container } = render(<Icon name="crown" label="personal record" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('img.ll-icon')).toBeNull();
  });

  it('renders the pixel art on the limelight skin', () => {
    withSkin('limelight');
    render(<Icon name="crown" label="personal record" />);
    const image = screen.getByRole('img', { name: 'personal record' });
    expect(image.getAttribute('src')).toBe(LIMELIGHT_ICONS.crown);
    expect(image.getAttribute('width')).toBe(String(DEFAULT_ICON_SIZE));
  });
});

describe('SkinLabel', () => {
  it('puts an icon beside the copy on limelight and none beside it elsewhere', () => {
    // The WORDS follow the skin too, since P8 Task 16: asserted through `copyFor` by key
    // rather than as a literal, so the expectation moves with the table it quotes.
    withSkin('limelight');
    const view = render(<SkinLabel copyKey="button.startSession" />);
    expect(screen.getByText(copyFor('limelight', 'button.startSession'))).toBeInTheDocument();
    expect(view.container.querySelectorAll('img.ll-icon')).toHaveLength(1);
    view.unmount();

    withSkin('clinical');
    const plain = render(<SkinLabel copyKey="button.startSession" />);
    expect(screen.getByText(copyFor('clinical', 'button.startSession'))).toBeInTheDocument();
    expect(plain.container.querySelectorAll('img.ll-icon')).toHaveLength(0);
  });

  it('renders the copy alone for a key with no icon, on every skin', () => {
    // 'button.back' is not an emoji position in round three section 4.4, so it has no entry.
    expect(ICON_FOR_KEY['button.back']).toBeUndefined();
    const { container } = render(<SkinLabel copyKey="button.back" />);
    // The default this file seeds is limelight, which carries no row for this key, so the
    // clinical string is what `copyFor` resolves and what the label renders.
    expect(screen.getByText(copyFor('limelight', 'button.back'))).toBeInTheDocument();
    expect(container.querySelectorAll('img.ll-icon')).toHaveLength(0);
  });

  it('maps the emoji positions the design named onto icons that exist', () => {
    // Round-three section 4.4, the "where it is used" column, restricted to the copy keys the
    // union carries today. The four keys P8 has not written yet are listed in Icon.tsx.
    expect(ICON_FOR_KEY['button.startSession']).toBe('nails');
    expect(ICON_FOR_KEY['advice.drinkToThirst']).toBe('drop');
    expect(ICON_FOR_KEY['button.trainSomethingElse']).toBe('heel');
    expect(ICON_FOR_KEY['button.pausePlan']).toBe('martini');
    expect(ICON_FOR_KEY['button.skipToday']).toBe('skip');
    expect(ICON_FOR_KEY['button.skipRest']).toBe('skip');
    expect(ICON_FOR_KEY['hero.weeklyTargetMissed']).toBe('alert');
    expect(ICON_FOR_KEY['status.rest']).toBe('stopwatchPanel');
    expect(ICON_FOR_KEY['label.settingsSkin']).toBe('crown');
    for (const name of Object.values(ICON_FOR_KEY)) {
      expect(Object.keys(LIMELIGHT_ICONS)).toContain(name);
    }
  });

  it('maps the two positions whose keys arrived after the map was written', () => {
    // Round three section 4.4 lists `pause` against "pause control"; the only pause control in
    // the app is the ticker's strip, and `button.pauseTicker` did not exist when this map was
    // written (P8 Task 14 added the key, P8 close-out B the mapping).
    expect(ICON_FOR_KEY['button.pauseTicker']).toBe('pause');
    // 4.4 lists `crown` against "pr_stamp MOTHER", which is the position the week stamp renders.
    // That position moved to its own key in P8 close-out B, and the crown moved with it.
    expect(ICON_FOR_KEY['status.weekMetStamp']).toBe('crown');
    expect(ICON_FOR_KEY['status.prStamp']).toBe('crown');
  });

  it('leaves the five icons no copy key names out of the map', () => {
    /*
     * Round three section 4.4 is sixteen icons; eleven of them are reachable from a copy key and
     * are asserted above. The other five are not absent by oversight:
     *
     *  - `barbell`, `sparkle` and `megaphone` are placed by components (the setlist, the stamp
     *    fan, the marquee lead and its separators), which the map's own header records;
     *  - `pause` and `skip` are also placed directly by the Marquee and the rest panel, and only
     *    `pause`'s copy-key position exists, which the test above pins;
     *  - `lips` has NO position in this app. 4.4 gives it "quote-tweet attribution" and "the
     *    reunion". The quote-tweet inset was never built (the plan's own "what this plan does not
     *    do": "the board skin's ... quote-tweet inset ... not built"), and "the reunion" is
     *    `hero.weekReview`, which 4.4 gives to `fan` in the row above. Inventing a second home
     *    for it would be putting art where the design put none.
     */
    const mapped = new Set(Object.values(ICON_FOR_KEY));
    expect(mapped.has('lips')).toBe(false);
    expect(mapped.has('barbell')).toBe(false);
    expect(mapped.has('sparkle')).toBe(false);
    expect(mapped.has('megaphone')).toBe(false);
    // The art itself still ships: what is absent is a copy key pointing at it, not the file.
    expect(LIMELIGHT_ICONS.lips.startsWith('data:image/png;base64,')).toBe(true);
  });
});
