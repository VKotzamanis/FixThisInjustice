import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { copy } from '../../content/copy';
import { SUPPLEMENT_GUIDANCE } from '../../content/supplementGuidance';
import { GuidanceScreen } from './GuidanceScreen';

describe('GuidanceScreen', () => {
  it('renders the guidance hero text', () => {
    render(<GuidanceScreen massKg={70} />);
    expect(screen.getByText(copy('hero.guidance'))).toBeInTheDocument();
  });

  it('renders all four section titles', () => {
    render(<GuidanceScreen massKg={70} />);
    for (const section of SUPPLEMENT_GUIDANCE) {
      expect(
        screen.getByRole('heading', { level: 3, name: section.heading }),
      ).toBeInTheDocument();
    }
  });

  it('renders personalized creatine dose based on massKg', () => {
    const { rerender } = render(<GuidanceScreen massKg={70} />);
    expect(screen.getByTestId('guidance-creatine-dose').textContent).toContain('7 g/day');

    rerender(<GuidanceScreen massKg={95.3} />);
    expect(screen.getByTestId('guidance-creatine-dose').textContent).toContain('9.5 g/day');
  });

  it('renders personalized caffeine pre-workout range based on massKg', () => {
    render(<GuidanceScreen massKg={70} />);
    expect(screen.getByTestId('guidance-caffeine-dose').textContent).toContain('63-140 mg');
  });

  it('renders a caution on the three sections that carry one, and none on kit', () => {
    render(<GuidanceScreen massKg={70} />);
    // creatine, caffeine and protein carry a caution; kit's is null and must render nothing.
    const notes = screen.getAllByRole('note');
    expect(notes.length).toBe(3);
    expect(notes[0]?.textContent).toContain(copy('label.caution'));
    expect(notes[1]?.textContent).toContain(copy('label.caution'));
  });

  it('renders disclosure details for sections that have sources', () => {
    const { container } = render(<GuidanceScreen massKg={70} />);
    const details = container.querySelectorAll('details');
    // Creatine, caffeine, and protein have sources; kit has empty sources.
    expect(details.length).toBe(3);
    for (const d of details) {
      expect(d.querySelector('summary')?.textContent).toBe(copy('disclosure.why'));
    }
  });

  it('renders no interactive form controls (no inputs, buttons, checkboxes, selects)', () => {
    const { container } = render(<GuidanceScreen massKg={70} />);
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(container.querySelectorAll('textarea')).toHaveLength(0);
  });
});
