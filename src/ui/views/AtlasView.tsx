// src/ui/views/AtlasView.tsx
//
// The Atlas: every specimen card that exists, grouped by rarity, with a locked slot standing
// in for each one this profile has not drawn. Cards are drawn on logged sets by the store's
// attemptSpecimenDraw (src/store/funActions.ts); nothing here rolls, writes or acquires.
//
// SELF-CONTAINED, AND NOT YET ROUTED. The view id 'atlas' is not in src/app/App.tsx's ViewId
// union, its NAV array or src/ui/nav/views.ts, and this task does not add it: those two lists
// are held in step by src/ui/nav/views.test.ts, and P8 Task 9 is the task that moves both. The
// component therefore reads everything it needs from the store and renders its own heading, so
// Task 9 mounts it with `{view === 'atlas' && <AtlasView />}` and nothing else changes here.
//
// WHAT A LOCKED SLOT MAY SAY. Its rarity, and that it is undiscovered. Not its title, not its
// category, not its body: a teaser assembled from the card's own content tells the user what
// they have not found, which is the one thing the collection exists to withhold. The slot is
// also not a control. It opens nothing, so rendering it as a disabled button would put 32
// unreachable tab stops in the grid, and rendering it as an enabled one would be a button that
// does nothing when pressed (master plan security constraint 30). It is static text.
//
// AN ID THE POOL DOES NOT KNOW IS NOT A CARD. The iteration runs over SPECIMEN_CARDS and asks
// the inventory about each id, never the reverse. A document migrated from the legacy build can
// carry an id the content rebuild dropped (specimenCards.ts, DROPPED_CARD_IDS): it names no
// card, so it is rendered nowhere and counted nowhere, and no count here can exceed its pool.
//
// Deviations from the P8 plan's Task 5 draft (recorded here; the plan is not edited):
//  - No rarity or category <select>. The pool is 37 cards and the draft's filters hid up to 36
//    of them behind two controls; rarity sections show the whole pool at once and give each
//    tier the count the task asks for. 'advice.noCardsMatch' therefore goes unrendered: with no
//    filter, no filter can match nothing.
//  - A body is read in a ModalShell dialog rather than expanded inside the grid button. The
//    draft's in-place expansion put a 60-word paragraph inside a button, which is neither a
//    valid interactive control nor readable in a 9 rem grid cell.
//  - The card id ('c001') is not printed. It is a storage key, not content, and on a locked
//    slot its letter leaks the rarity a second time.
//  - Counts come from FORMAT.atlasCount rather than a literal `${a}/${b}` in the view.

import { useCallback, useId, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { FORMAT, copy } from '../../content/copy';
import type { CopyKey } from '../../content/copy';
import {
  SPECIMEN_BY_ID,
  SPECIMEN_CARDS,
  SPECIMEN_RARITIES,
} from '../../content/specimenCards';
import type { SpecimenCard, SpecimenRarity } from '../../content/specimenCards';
import type { SpecimenInventory } from '../../domain/types';
import { ModalShell } from '../components/ModalShell';
import { useAppStore } from '../../store';
import './views.css';
import './atlas.css';

/** The word for each tier, by tier. A skin renames a tier here, never in the content module. */
const RARITY_LABEL: Readonly<Record<SpecimenRarity, CopyKey>> = {
  common: 'label.rarityCommon',
  uncommon: 'label.rarityUncommon',
  rare: 'label.rarityRare',
};

/**
 * Whether the inventory holds this card.
 *
 * An OWN property, not a truthy lookup: the inventory is a plain JSON object read back from
 * storage, and a bare `acquired[id]` answers yes to 'constructor' and every other name on
 * Object.prototype. No card id collides with one today, and this is what keeps that true.
 */
function holds(acquired: SpecimenInventory['acquired'] | undefined, id: string): boolean {
  return acquired !== undefined && Object.prototype.hasOwnProperty.call(acquired, id);
}

/** One card's full text. Mounted only for a card the profile actually holds. */
function AtlasCardDialog(props: { card: SpecimenCard; onClose: () => void }): ReactElement {
  const titleId = useId();
  const { card } = props;
  return (
    <ModalShell
      labelledBy={titleId}
      className="atlas-modal"
      backdropClassName="atlas-modal-bg"
      testId="atlas-card-backdrop"
      onClose={props.onClose}
    >
      <div className="atlas-modal-head">
        <div>
          <div className="atlas-modal-rarity">{copy(RARITY_LABEL[card.rarity])}</div>
          {/* The dialog's accessible name is the card, so the title carries the id. */}
          <h2 className="atlas-modal-title" id={titleId}>
            {card.title}
          </h2>
        </div>
        <button type="button" className="atlas-modal-close" onClick={props.onClose}>
          {copy('button.closeModal')}
        </button>
      </div>
      {/* Copy contract R10: a card body and its citation are reference text, exempt from the
          length rules and from R9, and bound by every other rule. */}
      <p className="atlas-modal-body">{card.body}</p>
      <p className="atlas-modal-source">
        <strong>{copy('label.atlasSource')}</strong>
        {': '}
        {FORMAT.atlasSource(card.source.citation, card.source.doi)}
      </p>
    </ModalShell>
  );
}

export function AtlasView(): ReactElement {
  const profileId = useAppStore((s) => s.activeProfileId);
  /*
   * The acquisition map itself, not a copy of it. The store hands back the stored object by
   * reference, so this selector returns a stable identity between draws and the memo below
   * recomputes only when a card is actually acquired. A profile that has drawn nothing has no
   * inventory at all (src/store/funActions.ts, inventoryOf), which reads as undefined here and
   * renders 37 locked slots: the honest picture, and the reason there is no empty state.
   */
  const acquired = useAppStore((s) =>
    profileId === null ? undefined : s.specimens[profileId]?.acquired,
  );

  const [openId, setOpenId] = useState<string | null>(null);
  // Referentially stable, as ModalShell's contract requires: an unstable onClose re-runs its
  // key listener and focus effect on every render of this view.
  const close = useCallback(() => {
    setOpenId(null);
  }, []);

  const sections = useMemo(
    () =>
      SPECIMEN_RARITIES.map((rarity) => {
        const cards = SPECIMEN_CARDS.filter((c) => c.rarity === rarity);
        return {
          rarity,
          cards,
          owned: cards.filter((c) => holds(acquired, c.id)).length, // [cards]
        };
      }),
    [acquired],
  );

  const ownedTotal = sections.reduce((sum, s) => sum + s.owned, 0); // [cards]

  /*
   * Ownership is re-checked here, on every render, and not only in the click handler that set
   * the id. Switching profiles while a dialog is open would otherwise leave the previous
   * profile's card on screen for a profile that has not drawn it, which is the one leak this
   * view exists to prevent.
   */
  const openCard =
    openId !== null && holds(acquired, openId) ? SPECIMEN_BY_ID[openId] : undefined;

  return (
    <section className="view atlas">
      <h2>{copy('hero.atlas')}</h2>
      <p className="view-note">{copy('advice.atlas')}</p>
      <p className="atlas-total">
        <span className="atlas-count-label">{copy('label.atlasCollected')}</span>{' '}
        <span className="atlas-count" data-testid="atlas-count-total">
          {FORMAT.atlasCount(ownedTotal, SPECIMEN_CARDS.length)}
        </span>
      </p>

      {sections.map((section) => (
        <section className="atlas-section" key={section.rarity}>
          <h3>{copy(RARITY_LABEL[section.rarity])}</h3>
          <p className="atlas-count" data-testid={`atlas-count-${section.rarity}`}>
            {FORMAT.atlasCount(section.owned, section.cards.length)}
          </p>
          {/*
            * The roles are explicit. `display: grid` on a <ul> drops the implicit list
            * semantics in WebKit, which is exactly the layout this grid uses, so the two roles
            * are restated rather than inherited.
            */}
          <ul className="atlas-grid" role="list">
            {section.cards.map((card) => (
              <li className="atlas-slot" role="listitem" key={card.id}>
                {holds(acquired, card.id) ? (
                  <button
                    type="button"
                    className={`atlas-card atlas-owned atlas-${card.rarity}`}
                    data-testid={`atlas-card-${card.id}`}
                    onClick={() => {
                      setOpenId(card.id);
                    }}
                  >
                    <span className="atlas-card-rarity">{copy(RARITY_LABEL[card.rarity])}</span>
                    <span className="atlas-card-title">{card.title}</span>
                  </button>
                ) : (
                  <div
                    className={`atlas-card atlas-locked atlas-${card.rarity}`}
                    data-testid={`atlas-card-${card.id}`}
                  >
                    <span className="atlas-card-rarity">{copy(RARITY_LABEL[card.rarity])}</span>
                    <span className="atlas-card-lock">{copy('status.undiscovered')}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {openCard !== undefined && <AtlasCardDialog card={openCard} onClose={close} />}
    </section>
  );
}
