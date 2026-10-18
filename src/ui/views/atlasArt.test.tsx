// The Atlas art: one icon per specimen card, loaded on demand, and the pixel question mark a
// locked slot carries instead of one.

import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { SPECIMEN_CARDS } from '../../content/specimenCards';
import { CARD_ICON_LOADERS, CardIcon, UnknownMark } from './atlasArt';

/**
 * The shipped icon files, read by FILE NAME rather than through the map under test, so a map
 * that pointed one card at another card's file fails here instead of passing because it agrees
 * with itself. Eager here only: the app loads them one at a time (atlasArt.tsx).
 */
const ICON_FILES = import.meta.glob<string>('../../assets/art/card-*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** `../../assets/art/card-c001.svg` -> `c001`; a name the pattern cannot read stays visible. */
function idOfPath(path: string): string {
  return /\/card-([^/]+)\.svg$/.exec(path)?.[1] ?? `unreadable file name: ${path}`;
}

function fileFor(id: string): string | undefined {
  return ICON_FILES[`../../assets/art/card-${id}.svg`];
}

const CARD_IDS: readonly string[] = SPECIMEN_CARDS.map((c) => c.id);

/*
 * First in the file on purpose: CardIcon keeps every file it has loaded, so a later mount of the
 * same card is drawn at once. 'c001' is mounted nowhere else in this file.
 */
describe('CardIcon while its file loads', () => {
  it('holds the box with an empty placeholder, then fills that same element with the icon', async () => {
    const { container } = render(<CardIcon id="c001" className="atlas-card-art" />);
    const box = container.querySelector('[data-card-icon="c001"]');
    expect(box).not.toBeNull();
    expect(box?.getAttribute('data-icon-state')).toBe('loading');
    expect(box?.getAttribute('class')).toBe('atlas-card-art');
    expect(box?.getAttribute('aria-hidden')).toBe('true');
    expect(box?.childNodes).toHaveLength(0);

    await waitFor(() => {
      expect(box?.getAttribute('data-icon-state')).toBe('ready');
    });
    // The SAME node, with the same class: the box atlas.css sizes is never swapped for another
    // element, so the card does not reflow when the icon arrives.
    expect(container.querySelector('[data-card-icon="c001"]')).toBe(box);
    expect(box?.getAttribute('class')).toBe('atlas-card-art');
    expect(box?.querySelector('svg')).not.toBeNull();
  });

  it('draws a card it has already loaded at once, with no placeholder frame', async () => {
    const first = render(<CardIcon id="c002" className="atlas-modal-art" />);
    await waitFor(() => {
      expect(first.container.querySelector('[data-icon-state="ready"]')).not.toBeNull();
    });
    first.unmount();
    const again = render(<CardIcon id="c002" className="atlas-modal-art" />);
    expect(again.container.querySelector('[data-card-icon="c002"]')?.getAttribute('data-icon-state')).toBe(
      'ready',
    );
  });
});

describe('CARD_ICON_LOADERS', () => {
  it('gives every card exactly one icon file, and leaves no icon file without a card', () => {
    // Both sides come from their sources: the ids from the content module, the files from the
    // folder. Sorted equality covers a card with no file and a file with no card at once.
    expect(new Set(CARD_IDS).size).toBe(CARD_IDS.length);
    const files = Object.keys(ICON_FILES).map(idOfPath);
    expect([...files].sort()).toEqual([...CARD_IDS].sort());
    expect(Object.keys(CARD_ICON_LOADERS).sort()).toEqual([...CARD_IDS].sort());
  });

  it("loads each card's icon from the file named for it, and from no other", async () => {
    const loaded = new Set<string>();
    for (const id of CARD_IDS) {
      const load = CARD_ICON_LOADERS[id];
      expect(load, `no loader for card ${id}`).toBeDefined();
      const markup = await load!();
      expect(markup).toBe(fileFor(id));
      loaded.add(markup);
    }
    expect(loaded.size).toBe(CARD_IDS.length);
  });

  it('draws every icon in currentColor on the 480 unit box, with no colour, script or link of its own', () => {
    // currentColor is what lets the panel's lime reach the art (AGENTS rule 5 for art as for CSS).
    // The markup is placed with innerHTML by InlineArt, so the file must carry nothing that runs.
    for (const id of CARD_IDS) {
      const markup = fileFor(id) ?? '';
      const host = document.createElement('div');
      host.innerHTML = markup;
      expect(host.querySelector('svg')?.getAttribute('viewBox'), id).toBe('0 0 480 480');
      expect(markup, id).toContain('fill="currentColor"');
      expect(markup, id).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(markup, id).not.toMatch(/<script|\son[a-z]+\s*=|href|<foreignObject/i);
    }
  });
});

describe('UnknownMark', () => {
  it('is a decorative 12 by 12 pixel mark in currentColor, on whole cells only', () => {
    const { container } = render(<UnknownMark className="probe" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 12 12');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('shape-rendering')).toBe('crispEdges');
    expect(svg?.getAttribute('data-mark')).toBe('unknown');
    expect(svg?.classList.contains('probe')).toBe(true);
    const path = svg?.querySelector('path');
    expect(path?.getAttribute('fill')).toBe('currentColor');
    // Every coordinate is a whole cell inside the grid: a fraction would land between pixels.
    const numbers = (path?.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g) ?? [];
    expect(numbers.length).toBeGreaterThan(0);
    for (const n of numbers) {
      expect(Number.isInteger(Number(n))).toBe(true);
      expect(Number(n)).toBeGreaterThanOrEqual(0);
      expect(Number(n)).toBeLessThanOrEqual(12);
    }
  });
});
