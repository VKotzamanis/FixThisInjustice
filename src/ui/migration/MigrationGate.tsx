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
 */
export function MigrationGate(): JSX.Element | null {
  /*
   * Read once per mount. The legacy key does not change while the app is open, and the wizard
   * needs the text to survive its own delete step: re-reading would hand it null the moment
   * the user accepted the deletion.
   */
  const [legacyRaw] = useState<string | null>(() => readLegacyV2Raw());
  const decision = useAppStore((s) => s.ui.legacyMigration);
  const profile = useActiveProfile();
  const plan = useActivePlan();

  /*
   * Latched, and deliberately not derived from `decision` alone.
   *
   * Applying the import writes ui.legacyMigration = 'done' as part of the same document the
   * migration installs (applyMigration). A gate that read only that field would therefore
   * unmount the wizard at the exact moment it has to make its last offer, deleting the old
   * data, and the user would never see it. Setting state during render is React's documented
   * way to derive state from a changed input; it re-renders before committing, so no extra
   * paint is shown.
   */
  const [visible, setVisible] = useState(decision === 'pending');
  if (decision === 'pending' && !visible) setVisible(true);

  if (!visible || legacyRaw === null || profile === null || plan === null) return null;

  return (
    <MigrationWizard
      legacyRaw={legacyRaw}
      profile={profile}
      plan={plan}
      onFinished={() => {
        setVisible(false);
      }}
    />
  );
}
