import { useState, type JSX } from 'react';

import { readLegacyV2Raw } from '../../store/persistence';
import { useAppStore } from '../../store';
import { useActivePlan, useActiveProfile } from '../../store/selectors';
import { MigrationWizard } from './MigrationWizard';

/**
 * The one line the app shell mounts. It decides whether the legacy import is offered at all,
 * and renders nothing in every other case.
 *
 * Four conditions have to hold together, and each one is a fact the wizard cannot supply for
 * itself:
 *
 *  - a legacy document exists on this device;
 *  - the user has not already decided ('done' or 'dismissed' are both final until Settings
 *    puts the decision back to 'pending');
 *  - a profile exists, because every migrated record is keyed by a profile id;
 *  - a plan exists, because the migration matches legacy days against its sessions.
 *
 * The last two are why this renders null rather than routing to setup: before setup has run
 * there is nothing to attach the old data to, `ui.legacyMigration` is still 'pending', and the
 * offer is therefore made on the next open, once a profile and a plan exist.
 *
 * **A panel, not a route and not a modal. Settled; do not re-open it.** The gate is rendered
 * beside the view switch, so the offer appears above the app rather than in place of it and
 * nothing about it blocks. The migration is optional: a user who has just installed the new
 * app is entitled to ignore the old data indefinitely and still log a set today. A route would
 * take the app away from them until they answered, and a modal would do the same with a focus
 * trap on top. What the panel does take is focus, once, on appearance (MigrationWizard), which
 * is the announcement a keyboard or screen-reader user needs without the trap.
 */
export function MigrationGate(): JSX.Element | null {
  const decision = useAppStore((s) => s.ui.legacyMigration);
  const profile = useActiveProfile();
  const plan = useActivePlan();

  /*
   * `visible` is latched, and deliberately not derived from `decision` alone.
   *
   * Applying the import writes ui.legacyMigration = 'done' before the wizard has made its last
   * offer, deleting the old data. A gate that read only that field would unmount the wizard at
   * exactly that moment and the user would never see the offer. So the wizard is closed by its
   * own onFinished and by nothing else.
   *
   * `legacyRaw` is read at each transition INTO 'pending', not once for the gate's life (code
   * review finding 8). Both facts the old single read got wrong are real: the wizard has to
   * keep the text across its own delete step, so the read cannot be per-render; and the
   * document CAN change under a long-lived gate, because the delete step removes it and
   * Settings can put the decision back to 'pending' afterwards. A cached string would then
   * hand the wizard a document that is no longer on the device, and it would offer to import
   * data the user has already destroyed. Reading on the transition satisfies both: one read
   * per offer, and a fresh one for every offer.
   *
   * Setting state during render is React's documented way to derive state from a changed
   * input; it re-renders before committing, so no extra paint is shown.
   */
  const [offer, setOffer] = useState<{ visible: boolean; legacyRaw: string | null }>(() => ({
    visible: decision === 'pending',
    legacyRaw: decision === 'pending' ? readLegacyV2Raw() : null,
  }));
  const [seen, setSeen] = useState(decision);
  if (decision !== seen) {
    setSeen(decision);
    if (decision === 'pending') setOffer({ visible: true, legacyRaw: readLegacyV2Raw() });
  }

  if (!offer.visible || offer.legacyRaw === null || profile === null || plan === null) return null;

  return (
    <MigrationWizard
      legacyRaw={offer.legacyRaw}
      profile={profile}
      plan={plan}
      onFinished={() => {
        setOffer((prev) => ({ ...prev, visible: false }));
      }}
    />
  );
}
