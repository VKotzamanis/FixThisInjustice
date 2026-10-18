// The Atlas view: the specimen collection, grouped by rarity, with a locked slot for every
// card the profile has not drawn yet.
//
// Deviations from the P8 plan's Task 5 Step 1 literal (recorded here; the plan is not edited):
//  - The plan's two <select> filters (rarity, category) are gone, and with them the four tests
//    that drove them. The view groups the pool into one section per rarity instead, which is
//    what the task's layout contract specifies: sections in the SPECIMEN_RARITIES order, each
//    carrying its own "n of N" count.
//  - A card body is read in a ModalShell dialog rather than expanded in place, so the assertion
//    on a revealed body is a dialog assertion and Escape closes it.
//  - A locked slot carries its rarity and nothing else. The plan's teaser also printed the
//    card's category and its id; both leak the shape of an undrawn card, and the id leaks its
//    rarity a second time. The test below asserts the body text of an undrawn card is absent
//    from the DOM entirely, not merely collapsed.
//  - The counts come from FORMAT.atlasCount, not from a literal `${a}/${b}` in the view.
//  - Ids are seeded through src/test/funFixtures.ts rather than a local literal, and the store
//    is the real one with installFakeStorage() installed, per the task's test contract.
//
// No clock is pinned: nothing this view renders reads the time. `at` is stored on an
// acquisition and never displayed here.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FORMAT, copyFor } from '../../content/copy';
import { DROPPED_CARD_IDS, SPECIMEN_BY_ID, SPECIMEN_CARDS } from '../../content/specimenCards';
import type { SpecimenCard, SpecimenRarity } from '../../content/specimenCards';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { FUN_PROFILE_ID, makeAppState, makeInventory } from '../../test/funFixtures';
import { AtlasView } from './AtlasView';
import type { SkinId } from '../../domain/types';
// The sheet as TEXT: jsdom computes no style and evaluates no media query, so the tier shapes,
// the token-only rule and the reduced-motion rule are asserted in the source. vitest.config.ts
// lists atlas.css under css.include for this, as it does train.css for restGameStyles.test.ts.
import atlasCss from './atlas.css?raw';

/** [ms] epoch, UTC. Arbitrary: no assertion below reads an acquisition instant. */
const ACQUIRED_AT = Date.UTC(2026, 8, 1, 9, 0);

/** Five cards: two common, one uncommon, two rare. The pool holds 12, 13 and 12. */
const OWNED: readonly string[] = ['c001', 'c002', 'u003', 'r001', 'r002'];

/** The shipped pool sizes, read from the content module rather than restated as literals. */
function shipped(rarity: SpecimenRarity): SpecimenCard[] {
  return SPECIMEN_CARDS.filter((c) => c.rarity === rarity);
}

function seed(ids: readonly string[]): void {
  const acquired: Record<string, { at: number; exerciseId: string | null }> = {};
  ids.forEach((id, index) => {
    acquired[id] = { at: ACQUIRED_AT + index, exerciseId: 'barbell-bench-press' };
  });
  useAppStore.setState(
    makeAppState({
      specimens: {
        [FUN_PROFILE_ID]: makeInventory({ acquired, totalSetsLogged: 40 /* [sets] */ }),
      },
    }),
  );
}

/** Every card slot on screen, in document order, by card id. */
function idsOnScreen(): string[] {
  const prefix = 'atlas-card-';
  return screen
    .getAllByTestId(/^atlas-card-/)
    .map((el) => (el.getAttribute('data-testid') ?? '').slice(prefix.length));
}

beforeEach(() => {
  // The store is the real one; the storage backing is faked so nothing this test does can
  // reach the device, and so no state leaks into the next test through jsdom's shared store.
  installFakeStorage();
  seed(OWNED);
});

/*
 * The app ships with `ui.skin: 'limelight'` (src/domain/schema.ts), so a component that reads
 * the table through `useCopy()` renders the limelight words, and the assertions in this file
 * quote them through `copyFor('limelight', key)`. The pin restates the only skin; until clinical
 * was removed it pinned clinical and the assertions quoted the default table.
 *
 * A seed that REPLACES `ui` (makeAppState, defaultState, wipeAll) puts the shipped skin back,
 * so it is a named function rather than an inline hook body: a test that reseeds calls it
 * again, after the seed.
 */
function pinSkin(skin: SkinId = 'limelight'): void {
  useAppStore.setState((s) => ({ ui: { ...s.ui, skin } }));
}

beforeEach(() => {
  pinSkin();
});

describe('AtlasView counts', () => {
  it('reports the collection against the pool, in total and per rarity', () => {
    render(<AtlasView />);
    expect(screen.getByTestId('atlas-count-total').textContent).toBe(
      FORMAT.atlasCount(OWNED.length, SPECIMEN_CARDS.length),
    );
    expect(screen.getByTestId('atlas-count-common').textContent).toBe(
      FORMAT.atlasCount(2, shipped('common').length),
    );
    expect(screen.getByTestId('atlas-count-uncommon').textContent).toBe(
      FORMAT.atlasCount(1, shipped('uncommon').length),
    );
    expect(screen.getByTestId('atlas-count-rare').textContent).toBe(
      FORMAT.atlasCount(2, shipped('rare').length),
    );
  });

  it('counts nothing for an empty collection', () => {
    seed([]);
    render(<AtlasView />);
    expect(screen.getByTestId('atlas-count-total').textContent).toBe(
      FORMAT.atlasCount(0, SPECIMEN_CARDS.length),
    );
  });
});

describe('AtlasView ordering', () => {
  it('renders every shipped card once, in rarity order and then in pool order', () => {
    render(<AtlasView />);
    const expected = [...shipped('common'), ...shipped('uncommon'), ...shipped('rare')].map(
      (c) => c.id,
    );
    expect(idsOnScreen()).toEqual(expected);
  });

  it('lists each rarity section as a list, in the shipped rarity order', () => {
    render(<AtlasView />);
    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(3);
    expect(within(lists[0]!).getAllByRole('listitem')).toHaveLength(shipped('common').length);
    expect(within(lists[1]!).getAllByRole('listitem')).toHaveLength(shipped('uncommon').length);
    expect(within(lists[2]!).getAllByRole('listitem')).toHaveLength(shipped('rare').length);
  });
});

describe('AtlasView accessible names', () => {
  it('names an owned card by its title, so the rarity does not run into it', () => {
    /*
     * The button held two <span>s and no label, so its name was computed from its contents and
     * the two ran together: "CommonThe crested newt". The rarity is already the section heading
     * above the grid and the eyebrow inside the card, so the NAME is the title alone; nothing is
     * lost from the announcement and the duplication goes.
     */
    render(<AtlasView />);
    const card = SPECIMEN_BY_ID['c001']!;
    expect(screen.getByRole('button', { name: card.title })).toBe(
      screen.getByTestId('atlas-card-c001'),
    );
  });

  it('names a locked slot by its rarity and the word that says it is undrawn', () => {
    // The slot is not a control, so it carries no name at all by default: a generic element has
    // no role to hang one on. `role="img"` is what makes the label reach assistive technology,
    // and the label repeats exactly what the two spans print, so nothing is hidden by it.
    render(<AtlasView />);
    const slot = screen.getByTestId('atlas-card-c003');
    expect(slot.getAttribute('role')).toBe('img');
    expect(slot).toHaveAccessibleName(
      FORMAT.atlasLockedName(copyFor('limelight', 'label.rarityCommon'), copyFor('limelight', 'status.undiscovered')),
    );
  });
});

describe('AtlasView locked slots', () => {
  it('shows an undrawn card as a silhouette carrying its rarity and nothing else', () => {
    render(<AtlasView />);
    const card = SPECIMEN_BY_ID['c003']!; // common, not in OWNED
    const slot = screen.getByTestId('atlas-card-c003');
    expect(slot.textContent).toContain(copyFor('limelight', 'status.undiscovered'));
    expect(slot.textContent).toContain(copyFor('limelight', 'label.rarityCommon'));
    expect(slot.textContent).not.toContain(card.title);
    expect(slot.textContent).not.toContain(card.category);
    // A slot with nothing to reveal is not a control: it opens no dialog, so it is not a
    // button that does nothing when pressed.
    expect(within(slot).queryByRole('button')).toBeNull();
  });

  it('keeps the body and the citation of every undrawn card out of the document', () => {
    render(<AtlasView />);
    for (const card of SPECIMEN_CARDS) {
      if (OWNED.includes(card.id)) continue;
      expect(screen.queryByText(card.body)).toBeNull();
      expect(screen.queryByText(card.source.citation, { exact: false })).toBeNull();
      expect(screen.queryByText(card.title)).toBeNull();
    }
  });
});

describe('AtlasView card detail', () => {
  it('opens a dialog naming the card, carrying its body and its citation', () => {
    render(<AtlasView />);
    const card = SPECIMEN_BY_ID['c001']!;
    fireEvent.click(screen.getByTestId('atlas-card-c001'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(card.body)).toBeTruthy();
    expect(
      within(dialog).getByText(FORMAT.atlasSource(card.source.citation, card.source.doi), {
        exact: false,
      }),
    ).toBeTruthy();
    // The dialog is named by the card's title, not by a static heading.
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).not.toBeNull();
    expect(document.getElementById(labelledBy!)?.textContent).toBe(card.title);
  });

  it('closes the dialog on Escape', () => {
    render(<AtlasView />);
    fireEvent.click(screen.getByTestId('atlas-card-c001'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(SPECIMEN_BY_ID['c001']!.body)).toBeNull();
  });

  it('closes the dialog on its Close control', () => {
    render(<AtlasView />);
    fireEvent.click(screen.getByTestId('atlas-card-c001'));
    fireEvent.click(within(screen.getByRole('dialog')).getByText(copyFor('limelight', 'button.closeModal')));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('AtlasView and dropped legacy ids', () => {
  it('renders none of them and counts none of them, even when the inventory holds them', () => {
    // A migrated legacy inventory can carry an id the rebuild dropped (specimenCards.ts,
    // DROPPED_CARD_IDS). It names no shipped card, so it is not a card: it appears nowhere and
    // is counted nowhere.
    seed([...DROPPED_CARD_IDS, 'c001', 'r001']);
    render(<AtlasView />);
    expect(screen.getByTestId('atlas-count-total').textContent).toBe(
      FORMAT.atlasCount(2, SPECIMEN_CARDS.length),
    );
    expect(screen.getByTestId('atlas-count-common').textContent).toBe(
      FORMAT.atlasCount(1, shipped('common').length),
    );
    expect(screen.getByTestId('atlas-count-uncommon').textContent).toBe(
      FORMAT.atlasCount(0, shipped('uncommon').length),
    );
    for (const id of DROPPED_CARD_IDS) {
      expect(screen.queryByTestId(`atlas-card-${id}`)).toBeNull();
    }
    expect(idsOnScreen()).toHaveLength(SPECIMEN_CARDS.length);
  });
});

/*
 * P8 Task 16: the words come from the copy table through `useCopy()`, so `ui.skin` decides
 * them. Asserted by KEY through `copyFor`, never as a literal, so the expectation follows the
 * table instead of having to be rewritten beside it.
 */
describe('AtlasView under a skin', () => {
  it('states the collection in the limelight words', () => {
    pinSkin('limelight');
    render(<AtlasView />);
    expect(screen.getByText(copyFor('limelight', 'advice.atlas'))).toBeInTheDocument();
  });
});

/*
 * The collectible treatment (styling survey 2026-10-18, item 8; owner ruling 2026-10-18: an icon
 * for every card). What a slot REVEALS is the contract above and does not move: an owned card adds
 * its own icon, a locked slot adds a pixel question mark and nothing that names or draws its card
 * or its category.
 */

/**
 * The shipped icon files, read by file name, so the comparison does not go through the view's
 * own map (atlasArt.tsx). Eager here only: the view loads each icon on demand.
 */
const ICON_FILES = import.meta.glob<string>('../../assets/art/card-*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function iconFile(id: string): string {
  return ICON_FILES[`../../assets/art/card-${id}.svg`] ?? `missing icon file for ${id}`;
}

/** An icon's markup as the DOM serialises it, so the comparison is not about whitespace. */
function serialised(markup: string): string {
  const host = document.createElement('span');
  host.innerHTML = markup;
  return host.innerHTML;
}

/** Waits until the icon inside `root` has arrived: the files load after the first render. */
async function iconReady(root: HTMLElement): Promise<Element> {
  return waitFor(() => {
    const icon = root.querySelector('[data-card-icon]');
    expect(icon?.getAttribute('data-icon-state')).toBe('ready');
    return icon!;
  });
}

/** Stubs matchMedia so the reduced-motion query answers `reduce`; the caller unstubs. */
function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('AtlasView collectible faces', () => {
  it('draws every owned card as a black panel carrying its own icon, once the icon has loaded', async () => {
    render(<AtlasView />);
    for (const id of OWNED) {
      const card = SPECIMEN_BY_ID[id]!;
      const face = screen.getByTestId(`atlas-card-${id}`);
      expect(face.classList.contains('ll-panel')).toBe(true);
      expect(face.classList.contains('atlas-face')).toBe(true);
      const icon = await iconReady(face);
      expect(icon.getAttribute('data-card-icon')).toBe(id);
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.innerHTML).toBe(serialised(iconFile(id)));
      // The category glyph it replaces is gone, not drawn beside it.
      expect(face.querySelector('[data-glyph]')).toBeNull();
      // The icon is decoration: the card is still named by its title alone.
      expect(face).toHaveAccessibleName(card.title);
    }
  });

  it('carries the same icon into the card dialog', async () => {
    render(<AtlasView />);
    fireEvent.click(screen.getByTestId('atlas-card-u003'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.classList.contains('ll-panel')).toBe(true);
    const icon = await iconReady(dialog);
    expect(icon.getAttribute('data-card-icon')).toBe('u003');
    expect(icon.innerHTML).toBe(serialised(iconFile('u003')));
    expect(dialog.querySelector('[data-glyph]')).toBeNull();
  });

  it('marks every locked slot with the question mark and with no icon or category', async () => {
    render(<AtlasView />);
    // Every owned icon has arrived first, so a load that lands late cannot land in a slot unseen.
    for (const id of OWNED) await iconReady(screen.getByTestId(`atlas-card-${id}`));
    for (const card of SPECIMEN_CARDS) {
      if (OWNED.includes(card.id)) continue;
      const slot = screen.getByTestId(`atlas-card-${card.id}`);
      expect(slot.querySelector('[data-mark="unknown"]')).not.toBeNull();
      expect(slot.querySelector('[data-card-icon]')).toBeNull();
      expect(slot.querySelector('[data-glyph]')).toBeNull();
      expect(slot.classList.contains('ll-panel')).toBe(false);
      // Not in an attribute, a class or a path either: the whole serialised slot is checked.
      expect(slot.outerHTML.toLowerCase()).not.toContain(card.category);
      for (const markup of Object.values(ICON_FILES)) {
        expect(slot.innerHTML).not.toContain(serialised(markup));
      }
    }
  });
});

describe('AtlasView rarity marks', () => {
  it('gives an owned rare card the rare mark and the one-shot foil, and no other tier the foil', () => {
    render(<AtlasView />);
    const rare = screen.getByTestId('atlas-card-r001');
    expect(rare.classList.contains('atlas-rare')).toBe(true);
    expect(rare.classList.contains('atlas-foil')).toBe(true);
    for (const id of ['c001', 'u003']) {
      expect(screen.getByTestId(`atlas-card-${id}`).classList.contains('atlas-foil')).toBe(false);
    }
    // A locked rare slot has not been drawn, so there is nothing to shine.
    const lockedRare = SPECIMEN_CARDS.find((c) => c.rarity === 'rare' && !OWNED.includes(c.id))!;
    expect(screen.getByTestId(`atlas-card-${lockedRare.id}`).classList.contains('atlas-foil')).toBe(
      false,
    );

    fireEvent.click(rare);
    const dialog = screen.getByRole('dialog');
    expect(dialog.classList.contains('atlas-rare')).toBe(true);
    expect(dialog.classList.contains('atlas-foil')).toBe(true);
  });

  it('keeps the foil when matchMedia answers that motion is allowed', () => {
    stubReducedMotion(false);
    try {
      render(<AtlasView />);
      expect(screen.getByTestId('atlas-card-r001').classList.contains('atlas-foil')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('drops the foil under prefers-reduced-motion and keeps the static rare mark', () => {
    stubReducedMotion(true);
    try {
      render(<AtlasView />);
      const rare = screen.getByTestId('atlas-card-r001');
      expect(rare.classList.contains('atlas-foil')).toBe(false);
      expect(rare.classList.contains('atlas-rare')).toBe(true);
      fireEvent.click(rare);
      expect(screen.getByRole('dialog').classList.contains('atlas-foil')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('atlas.css', () => {
  /** The declaration block of the first rule whose selector list matches. */
  function block(css: string, selector: RegExp): string {
    const match = new RegExp(`${selector.source}[^{]*\\{([^}]*)\\}`).exec(css);
    return match?.[1] ?? '';
  }

  it('names a token for every colour, with no hex literal (AGENTS rule 5)', () => {
    // Comments are dropped first: they quote measured colours, which is documentation.
    const rules = atlasCss.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('draws the three tiers as three shapes, not three colours', () => {
    // uncommon: two lime rules; rare: a pink rule and the pink offset block; locked: dashed.
    const uncommon = block(atlasCss, /\.atlas-face\.atlas-uncommon\s*/);
    expect(uncommon.match(/var\(--lime\)/g)).toHaveLength(2);
    const rare = block(atlasCss, /\.atlas-face\.atlas-rare\s*/);
    expect(rare).toMatch(/var\(--shadow-offset[^)]*\)\s+var\(--shadow-offset[^)]*\)\s+0\s+0\s+var\(--pink\)/);
    expect(block(atlasCss, /\.atlas \.atlas-locked\s*/)).toMatch(/border:[^;]*dashed/);
  });

  it('gives each art box a fixed square size, so a loading icon and a loaded one take the same space', () => {
    for (const selector of [/\.atlas \.atlas-card-art\s*/, /\.atlas \.atlas-modal-art\s*/]) {
      const rule = block(atlasCss, selector);
      const width = /(?:^|[;\s])width:\s*([\d.]+rem)/.exec(rule)?.[1];
      const height = /(?:^|[;\s])height:\s*([\d.]+rem)/.exec(rule)?.[1];
      expect(width, selector.source).toBeDefined();
      expect(height, selector.source).toBe(width);
    }
  });

  it('runs the foil once and cancels it under prefers-reduced-motion', () => {
    expect(block(atlasCss, /\.atlas-foil::after\s*/)).toMatch(/animation:[^;]*\b1\b/);
    const at = atlasCss.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(atlasCss.slice(at)).toMatch(/\.atlas-foil::after\s*\{[^}]*animation:\s*none/);
  });
});
