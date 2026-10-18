// The one status-mark set the Today strip and the Log compliance grid share (stylize survey item
// 6). The guarantees asserted here are the ones a reader cannot see in a screenshot: every mark is
// drawn on the same 12-unit pixel grid, no two states share an ink shape (WCAG 1.4.1: shape, not
// shade, carries the state), the colours come from tokens, and the accessible name is the caller's
// label exactly once.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import statusMarkCss from './statusMark.css?raw';
import { MARK_GRIDS, MARK_KINDS, StatusMark, gridPath, type MarkKind } from './StatusMark';

/** [grid units] The side of every mark's pixel grid. */
const GRID = 12;

function markOf(kind: MarkKind, label?: string): SVGSVGElement {
  const { container } = render(
    label === undefined ? <StatusMark kind={kind} /> : <StatusMark kind={kind} label={label} />,
  );
  const svg = container.querySelector('svg');
  if (svg === null) throw new Error(`no svg rendered for ${kind}`);
  return svg;
}

describe('StatusMark grids', () => {
  it('draws every kind on a 12 x 12 grid of # and . only', () => {
    for (const kind of MARK_KINDS) {
      const grid = MARK_GRIDS[kind];
      const layers = grid.chip === undefined ? [grid.ink] : [grid.ink, grid.chip];
      for (const layer of layers) {
        expect({ kind, rows: layer.length }).toEqual({ kind, rows: GRID });
        for (const row of layer) {
          expect({ kind, row, ok: row.length === GRID && /^[#.]+$/.test(row) }).toEqual({
            kind,
            row,
            ok: true,
          });
        }
      }
    }
  });

  it('gives no two states the same ink shape, so shape alone tells them apart', () => {
    const inkOf = new Map(MARK_KINDS.map((kind) => [kind, MARK_GRIDS[kind].ink.join('\n')]));
    for (const a of MARK_KINDS) {
      for (const b of MARK_KINDS) {
        if (a === b) continue;
        expect({ a, b, same: inkOf.get(a) === inkOf.get(b) }).toEqual({ a, b, same: false });
      }
    }
  });

  it('turns a grid into one path of unit rectangles, merging runs along a row', () => {
    expect(gridPath(['##.#', '....'])).toBe('M0 0h2v1h-2z M3 0h1v1h-1z');
    expect(gridPath(['....'])).toBe('');
  });
});

describe('StatusMark rendering', () => {
  it('renders each kind at 12 px with its kind and shape on data attributes', () => {
    const shapes = new Set<string>();
    for (const kind of MARK_KINDS) {
      const svg = markOf(kind);
      expect(svg.getAttribute('viewBox')).toBe('0 0 12 12');
      expect(svg.getAttribute('width')).toBe('12'); // [CSS px]: one grid unit per pixel
      expect(svg.getAttribute('data-mark')).toBe(kind);
      shapes.add(svg.getAttribute('data-shape') ?? '');
    }
    expect(shapes.size).toBe(MARK_KINDS.length);
  });

  it('carries the caller label as its only accessible name', () => {
    const svg = markOf('completed', 'served');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('served');
    expect(svg.querySelector('title')).toBeNull();
  });

  it('hides itself from assistive technology when the container already names it', () => {
    const svg = markOf('missed');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
  });

  it('puts a chip under the ink only on the two marks drawn as filled chips', () => {
    expect(markOf('completed').querySelector('.sm-chip-completed')).not.toBeNull();
    expect(markOf('missed').querySelector('.sm-chip-missed')).not.toBeNull();
    for (const kind of MARK_KINDS.filter((k) => k !== 'completed' && k !== 'missed')) {
      expect({ kind, chip: markOf(kind).querySelector('[class^="sm-chip"]') }).toEqual({
        kind,
        chip: null,
      });
    }
  });
});

describe('StatusMark colours (statusMark.css)', () => {
  it('draws the ink in currentColor and every fill from a token', () => {
    expect(statusMarkCss).toMatch(/\.sm-ink\s*\{[^}]*fill:\s*currentColor/);
    // Pink is a FILL behind ink here (7.75:1), never the ink itself (1.41:1 on lime).
    expect(statusMarkCss).toMatch(/\.sm-chip-completed\s*\{[^}]*fill:\s*var\(--accent\)/);
    expect(statusMarkCss).toMatch(/\.sm-chip-missed\s*\{[^}]*fill:\s*var\(--highlight-bg\)/);
    expect(statusMarkCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(statusMarkCss).not.toMatch(/(^|[;{\s])color:\s*var\(--(accent|pink)/);
  });
});
