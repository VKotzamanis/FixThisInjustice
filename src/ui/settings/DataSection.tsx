import { useState, type JSX } from 'react';

import { ConfirmDestructive } from '../components/ConfirmDestructive';
import { copy } from '../../content/copy';
import { useAppStore } from '../../store';
import { deleteLegacyV2, hasLegacyV2, readLegacyV2Raw } from '../../store/persistence';
import { ExportView } from '../views/ExportView';

/**
 * The Data section of Settings: the exports, the legacy import offer, and the two destructive
 * controls (P7 Task 6, master plan section 3).
 *
 * It is one SETTINGS_ROWS entry, and it is a component rather than an inline fragment because
 * it holds state: which confirmation panel is open, and whether a legacy document is still on
 * the device. `SettingsRow.render` is a plain function called during SettingsView's render, so
 * a hook could not live there.
 *
 * WHY BOTH DESTRUCTIVE CONTROLS SIT BEHIND A TRIGGER. Security finding H2: the legacy console
 * put a one-tap wipe in the footer of every screen. Neither confirmation panel is mounted
 * until its trigger is pressed, so there is no always-visible wipe control, and the panel that
 * does mount holds the two gates master plan section 3 requires of every destructive action --
 * a completed export, then a typed word (ConfirmDestructive owns both).
 *
 * ONE PANEL AT A TIME, which is why `open` is a union rather than two booleans. Both panels
 * confirm on the same word, so both label their field 'Type DELETE to confirm' and both carry
 * a 'Cancel'. Two of each on screen at once is a pair of controls a screen reader cannot tell
 * apart, and the wrong one of them destroys the wrong thing.
 *
 * A trigger BUTTON rather than a <details> disclosure, which is what the rest of this view
 * uses for its explanatory asides. Two reasons, and the first is the load-bearing one:
 * unmounting the panel on close is what re-arms the export gate (ConfirmDestructive holds
 * `exported` as its own state, so a backup taken before a cancel does not open the gate on the
 * next attempt), and a <details> that keeps its children mounted while closed would carry that
 * fact across. Second, jsdom does not implement the summary activation behaviour, so a
 * disclosure built that way could not be driven by a test at all (measured 2026-09-02).
 */

/** The word master plan section 3 fixes for every destructive confirmation. */
const CONFIRM_WORD = 'DELETE';

/**
 * The backup filenames. Neither carries a date: the wipe export is the whole document and the
 * legacy export is a document the app no longer writes, so there is no series to order.
 */
const WIPE_FILENAME = 'fixthisinjustice-export.json';
const LEGACY_FILENAME = 'fixthisinjustice-legacy-v2.json';

type OpenPanel = 'none' | 'wipe' | 'legacy';

export function DataSection(): JSX.Element {
  const decision = useAppStore((s) => s.ui.legacyMigration);
  const [open, setOpen] = useState<OpenPanel>('none');
  const [legacyPresent, setLegacyPresent] = useState(() => hasLegacyV2());

  /*
   * The legacy document is re-read whenever the migration decision changes, not once for the
   * life of the section. The wizard this section can reopen ends by offering to delete the old
   * data, and it writes the decision when it finishes; a presence latched at mount would then
   * keep offering to delete keys that are already gone. This is MigrationGate's own pattern
   * (src/ui/migration/MigrationGate.tsx, code review finding 8), and setting state during
   * render is React's documented way to derive state from a changed input: it re-renders
   * before committing, so no extra paint is shown.
   */
  const [seen, setSeen] = useState(decision);
  if (decision !== seen) {
    setSeen(decision);
    setLegacyPresent(hasLegacyV2());
  }

  const wipe = (): void => {
    // Closed first, then wiped. wipeAll() empties the document, which unmounts this whole
    // section (SettingsView has no profile to edit), so the order only matters for what React
    // renders in between -- and closing first means it is never the armed panel.
    setOpen('none');
    useAppStore.getState().wipeAll();
  };

  const removeLegacy = (): void => {
    setOpen('none');
    deleteLegacyV2();
    setLegacyPresent(false);
  };

  return (
    <>
      {/*
       * Export first, and it renders its own heading. A user who arrives here to destroy
       * something passes the control that keeps a copy of it on the way in.
       */}
      <ExportView />

      <h2>{copy('hero.dataOnDevice')}</h2>
      <p className="view-note">{copy('advice.dataOnDevice')}</p>

      {legacyPresent && decision !== 'pending' && (
        <>
          <button
            type="button"
            onClick={() => {
              // 'pending' is what MigrationGate watches; it re-reads the legacy document on
              // the transition and renders the wizard. Nothing here reads or writes that
              // document itself.
              useAppStore.getState().setUi({ legacyMigration: 'pending' });
            }}
          >
            {copy('button.legacyReopen')}
          </button>
          <p className="view-note">{copy('advice.legacyOldDataKept')}</p>
        </>
      )}

      {open === 'wipe' ? (
        <div className="view-field">
          <p className="view-note">{copy('advice.wipeRemoves')}</p>
          <ConfirmDestructive
            word={CONFIRM_WORD}
            exportLabelKey="button.downloadBackup"
            exportFilename={WIPE_FILENAME}
            /*
             * Read when the user asks for it, not at render: the document the backup has to
             * carry is the one that exists at the moment of the export, and this panel can sit
             * open across edits made in another tab.
             */
            exportText={() => useAppStore.getState().exportJson()}
            confirmLabelKey="button.wipeConfirm"
            onConfirm={wipe}
            onCancel={() => {
              setOpen('none');
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          disabled={open !== 'none'}
          onClick={() => {
            setOpen('wipe');
          }}
        >
          {copy('button.wipeAll')}
        </button>
      )}

      {legacyPresent &&
        (open === 'legacy' ? (
          <div className="view-field">
            <p className="view-note">{copy('advice.deleteLegacy')}</p>
            <ConfirmDestructive
              word={CONFIRM_WORD}
              exportLabelKey="button.downloadLegacyJson"
              exportFilename={LEGACY_FILENAME}
              /*
               * The RAW legacy text, not a migrated projection of it. This export is the last
               * copy of whatever the migration refused, so it has to be the bytes as stored.
               * The empty string covers a document that has gone since this row rendered: the
               * export gate still has to be passable, and an empty backup of nothing is
               * honest about what was there.
               */
              exportText={() => readLegacyV2Raw() ?? ''}
              confirmLabelKey="button.legacyDeleteOld"
              onConfirm={removeLegacy}
              onCancel={() => {
                setOpen('none');
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            disabled={open !== 'none'}
            onClick={() => {
              setOpen('legacy');
            }}
          >
            {copy('button.deleteLegacy')}
          </button>
        ))}
    </>
  );
}
