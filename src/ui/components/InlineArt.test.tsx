// The one component that places a bundled SVG file's text in the DOM (build brief 2026-10-18,
// art style: SVG art is inlined through `?raw` so `currentColor` works). The Atlas card icons and
// the setup wizard's drawings both render through it.
import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { InlineArt } from './InlineArt';
import { CardIcon } from '../views/atlasArt';
import { SetupArt, SetupIcon, SETUP_ICON_ART } from '../setup/setupArt';
import atlasArtSource from '../views/atlasArt.tsx?raw';
import setupArtSource from '../setup/setupArt.tsx?raw';

const MARKUP = '<svg viewBox="0 0 4 4"><path d="M0 0h4v4H0z" fill="currentColor"/></svg>';

describe('InlineArt', () => {
  it('places the markup in a decorative span named by its data attribute', () => {
    const { container } = render(
      <InlineArt markup={MARKUP} data={{ 'data-art': 'probe' }} className="a b" style={{ flexGrow: 3 }} />,
    );
    const span = container.firstElementChild;
    expect(span?.tagName).toBe('SPAN');
    expect(span?.getAttribute('aria-hidden')).toBe('true');
    expect(span?.getAttribute('data-art')).toBe('probe');
    expect(span?.getAttribute('class')).toBe('a b');
    expect((span as HTMLElement | null)?.style.flexGrow).toBe('3');
    expect(span?.querySelector('svg path')?.getAttribute('fill')).toBe('currentColor');
  });

  it('renders the markup as given: a caller that wants it trimmed trims it', () => {
    const { container } = render(<InlineArt markup={`${MARKUP} `} data={{ 'data-glyph': 'x' }} />);
    const span = container.firstElementChild;
    expect(span?.getAttribute('class')).toBeNull();
    expect(span?.lastChild?.nodeType).toBe(Node.TEXT_NODE);
  });
});

describe('the Atlas and the setup wizard share it', () => {
  it('neither art module sets innerHTML itself; both import InlineArt', () => {
    for (const source of [atlasArtSource, setupArtSource]) {
      expect(source).not.toContain('dangerouslySetInnerHTML');
      expect(source).toMatch(/import \{ InlineArt \} from '\.\.\/components\/InlineArt';/);
    }
  });

  it('CardIcon keeps its contract: span, class, data-card-icon, aria-hidden, the file as is', async () => {
    const { container } = render(<CardIcon id="r001" className="atlas-card-art" />);
    const span = container.firstElementChild;
    expect(span?.tagName).toBe('SPAN');
    expect(span?.getAttribute('class')).toBe('atlas-card-art');
    expect(span?.getAttribute('data-card-icon')).toBe('r001');
    expect(span?.getAttribute('aria-hidden')).toBe('true');
    await waitFor(() => {
      expect(span?.querySelector('svg')).not.toBeNull();
    });
  });

  it('SetupArt and SetupIcon keep theirs: wiz-art class first, data-art, trimmed markup', () => {
    const { container } = render(
      <>
        <SetupIcon id="tape-neck" className="wiz-site-art" />
        <SetupArt id="bf-probe" markup={`  ${MARKUP}\n`} style={{ flexGrow: 2 }} />
      </>,
    );
    const [icon, art] = [...container.children];
    expect(icon?.getAttribute('class')).toBe('wiz-art wiz-site-art');
    expect(icon?.getAttribute('data-art')).toBe('tape-neck');
    expect(icon?.innerHTML.startsWith('<svg')).toBe(true);
    expect(icon?.innerHTML.endsWith('</svg>')).toBe(true);
    expect(SETUP_ICON_ART['tape-neck'].endsWith('</svg>')).toBe(false);
    expect(art?.getAttribute('class')).toBe('wiz-art');
    expect(art?.getAttribute('data-art')).toBe('bf-probe');
    expect((art as HTMLElement | undefined)?.style.flexGrow).toBe('2');
    expect(art?.childNodes).toHaveLength(1);
  });
});
