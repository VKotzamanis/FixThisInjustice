import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { copy } from '../../content/copy';
import { GUIDANCE_REFERENCES, GUIDANCE_UNSOURCED_LABEL } from '../../content/guidanceReferences';
import { SUPPLEMENT_GUIDANCE } from '../../content/supplementGuidance';
import { GuidanceScreen } from './GuidanceScreen';

describe('GuidanceScreen', () => {
  it('renders the guidance hero text', () => {
    render(<GuidanceScreen massKg={70} />);
    expect(screen.getByText(copy('hero.guidance'))).toBeInTheDocument();
  });

  it('renders all eight topic headings', () => {
    render(<GuidanceScreen massKg={70} />);
    expect(SUPPLEMENT_GUIDANCE).toHaveLength(8);
    for (const section of SUPPLEMENT_GUIDANCE) {
      expect(
        screen.getByRole('heading', { level: 3, name: section.heading }),
      ).toBeInTheDocument();
    }
  });

  /**
   * THE POINT OF THE REBUILD, claim r2.18. The step was read as a wall, so it opens as a menu.
   * Asserted twice on purpose: `open` catches a stray attribute in the markup, and the
   * visibility check catches the same thing through the rendered result, which is what the
   * reader actually meets.
   */
  describe('nothing is expanded on first render', () => {
    it('no details element carries open', () => {
      const { container } = render(<GuidanceScreen massKg={70} />);
      const all = container.querySelectorAll('details');
      // Eight topics plus the references box at the foot.
      expect(all).toHaveLength(SUPPLEMENT_GUIDANCE.length + 1);
      for (const details of all) {
        expect({ testid: details.getAttribute('data-testid'), open: details.open }).toEqual({
          testid: details.getAttribute('data-testid'),
          open: false,
        });
      }
    });

    it('every topic body is hidden until the reader opens it', () => {
      render(<GuidanceScreen massKg={70} />);
      for (const section of SUPPLEMENT_GUIDANCE) {
        expect(screen.getByText(section.answer)).not.toBeVisible();
      }
    });

    it('every topic heading stays visible, so the step reads as a menu', () => {
      render(<GuidanceScreen massKg={70} />);
      for (const section of SUPPLEMENT_GUIDANCE) {
        expect(
          screen.getByRole('heading', { level: 3, name: section.heading }),
        ).toBeVisible();
      }
    });
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

  /**
   * The defect the rebuild fixed: the old bodies carried `{dose}`, `{lo}` and `{hi}` and the
   * screen rendered them raw, so a reader saw the braces. Nothing on this screen may print one.
   */
  it('prints no unsubstituted brace slot anywhere on the screen', () => {
    const { container } = render(<GuidanceScreen massKg={70} />);
    expect(container.textContent ?? '').not.toMatch(/[{}]/);
  });

  it('renders a caution on the three topics that carry one', () => {
    render(<GuidanceScreen massKg={70} />);
    const notes = screen.getAllByRole('note');
    // creatine, caffeine and protein carry a safety statement; the other five do not.
    expect(notes).toHaveLength(3);
    for (const note of notes) {
      expect(note.textContent).toContain(copy('label.caution'));
    }
  });

  describe('the claims with no source', () => {
    it('marks each unsourced topic on its own face', () => {
      render(<GuidanceScreen massKg={70} />);
      for (const id of ['water', 'electrolytes', 'shoes', 'kit']) {
        const gap = screen.getByTestId(`guidance-gap-${id}`);
        expect(gap.textContent).toContain(GUIDANCE_UNSOURCED_LABEL);
      }
    });

    it('leaves no placeholder on a topic that is fully sourced', () => {
      render(<GuidanceScreen massKg={70} />);
      for (const id of ['creatine', 'caffeine', 'protein', 'cooldown']) {
        expect(screen.queryByTestId(`guidance-gap-${id}`)).toBeNull();
      }
    });
  });

  describe('the references box at the foot', () => {
    it('is collapsed, and titled by the shared references key', () => {
      render(<GuidanceScreen massKg={70} />);
      const refs = screen.getByTestId('guidance-references');
      expect((refs as HTMLDetailsElement).open).toBe(false);
      expect(refs.querySelector('summary')?.textContent).toBe(copy('disclosure.references'));
    });

    it('prints every entry once, under a single numbering scheme', () => {
      render(<GuidanceScreen massKg={70} />);
      const items = screen.getByTestId('guidance-references').querySelectorAll('li');
      expect(items).toHaveLength(GUIDANCE_REFERENCES.length);
    });

    it('prints every published citation in full, DOI included', () => {
      render(<GuidanceScreen massKg={70} />);
      const text = screen.getByTestId('guidance-references').textContent ?? '';
      for (const ref of GUIDANCE_REFERENCES) {
        if (ref.cite.kind !== 'published') continue;
        expect(text).toContain(ref.cite.text);
        expect(text).toContain(ref.cite.doi);
      }
    });

    it('prints every unsourced row as a marked placeholder naming the claim', () => {
      render(<GuidanceScreen massKg={70} />);
      const text = screen.getByTestId('guidance-references').textContent ?? '';
      const unsourced = GUIDANCE_REFERENCES.filter((ref) => ref.cite.kind === 'unsourced');
      expect(unsourced).toHaveLength(5);
      for (const ref of unsourced) {
        if (ref.cite.kind !== 'unsourced') continue;
        expect(text).toContain(ref.cite.claim);
      }
      expect(text).toContain(GUIDANCE_UNSOURCED_LABEL);
    });
  });

  it('renders no interactive form controls (no inputs, buttons, checkboxes, selects)', () => {
    const { container } = render(<GuidanceScreen massKg={70} />);
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(container.querySelectorAll('textarea')).toHaveLength(0);
  });
});
