import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DEFAULT_ICON_SIZE, Icon } from './Icon';
import { LIMELIGHT_ICONS } from './icons';

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
