import { useState, type JSX } from 'react';

import { ConfirmDestructive } from '../components/ConfirmDestructive';
import { copy } from '../../content/copy';
import { todayLocal } from '../../domain/dates';
import { clearAssetStorage } from '../../domain/motivation/assets';
import { useAppStore } from '../../store';
import {
  deleteLegacyV2,
  hasAnyLegacyKey,
  hasLegacyV2,
  readLegacyBundle,
} from '../../store/persistence';
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
 * a 'Cancel'; opening one at a time keeps the wipe and the legacy delete from being two
 * identical-looking sets of controls that destroy different things.
 *
 * That is no longer the ONLY thing standing between them (P7 Task 6 review, item 2): each
 * panel is a named `role="group"`, and it has to be, because the Replace confirmation in
 * ExportView -- mounted by this same section, above these controls -- is now the same
 * component and can be open at the same time as either of them. The rule here stays because it
 * is about this section's own two panels, which confirm on one word and cannot be told apart
 * by what the user types into them.
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

type OpenPanel = 'none' | 'wipe' | 'legacy';

export function DataSection(): JSX.Element {
  const decision = useAppStore((s) => s.ui.legacyMigration);
  const profile = useAppStore((s) =>
    s.activeProfileId === null ? null : (s.profiles[s.activeProfileId] ?? null),
  );
  const [open, setOpen] = useState<OpenPanel>('none');
  /*
   * Two questions, not one (P7 Task 6 review, item 3). `hasLegacyV2` asks whether the document
   * the MIGRATION needs is here, and only the reopen offer turns on it. The delete reaches all
   * three legacy keys, so the control that offers it asks the wider question: a device holding
   * only `fti.plan.v1` has legacy data to clean up and nothing to import.
   */
  const [legacyDoc, setLegacyDoc] = useState(() => hasLegacyV2());
  const [anyLegacy, setAnyLegacy] = useState(() => hasAnyLegacyKey());
  /** True once a wipe has run whose clip-store clear was refused. */
  const [clipUncleared, setClipUncleared] = useState(false);

  /*
   * Every backup this section offers is stamped with the PROFILE's own civil date, never the
   * device's (master plan section 3), through the same `todayLocal` ExportView uses. Findings
   * A8 and A10 forbid the UTC serialisation shortcut here: it names the day in Greenwich, which
   * for a user east or west of it is not the day they were living in when they took the backup.
   * The 'export' fallback is ExportView's: with no profile there is no zone to date the file in.
   */
  const stamp = profile === null ? 'export' : todayLocal(profile.timezone, Date.now());

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
    setLegacyDoc(hasLegacyV2());
    setAnyLegacy(hasAnyLegacyKey());
  }

  const wipe = (): void => {
    // Closed first, then wiped. wipeAll() empties the document, which unmounts this whole
    // section (SettingsView has no profile to edit), so the order only matters for what React
    // renders in between -- and closing first means it is never the armed panel.
    setOpen('none');
    /*
     * The clip store FIRST, then the document (security recommendation 10 / M5). The wipe used
     * to call wipeAll() alone, which empties `fti.v3` and this app's session mirror; the
     * motivation clip the user chose lives in IndexedDB and survived a wipe that told them
     * everything on the device had been removed. Clearing it before the document is emptied
     * also keeps the two in the only order that can be recovered from: a clip cleared after
     * the document is gone would be cleared out of a store nothing is left to describe.
     *
     * A refusal does NOT hold the wipe back. `clearAssetStorage` rejects on a quota refusal, on
     * Safari private mode and on an upgrade another tab is blocking, and a document left intact
     * because a clip could not be removed is a worse outcome than a clip left behind: the user
     * asked for their records to be gone. The refusal is reported instead.
     *
     * The line reporting it is state on THIS section, so it is only seen where the section is
     * still mounted after the wipe. Inside SettingsView it is not: a wipe leaves no profile and
     * that view then renders its 'set up first' paragraph in place of every row. Carrying the
     * message across that unmount needs a host that outlives the wipe, which is a change to
     * App.tsx rather than to this file.
     */
    void (async () => {
      try {
        await clearAssetStorage();
      } catch {
        // The reason is not shown: it is an IndexedDB message the user cannot act on, and the
        // one actionable fact -- the clip may still be on the device -- is in the copy line.
        setClipUncleared(true);
      }
      useAppStore.getState().wipeAll();
    })();
  };

  const removeLegacy = (): void => {
    setOpen('none');
    deleteLegacyV2();
    setLegacyDoc(false);
    setAnyLegacy(false);
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

      {legacyDoc && decision !== 'pending' && (
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
            titleKey="label.confirmWipe"
            word={CONFIRM_WORD}
            exportLabelKey="button.downloadBackup"
            exportFilename={`fti-state-${stamp}.json`}
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

      {clipUncleared && (
        <p className="view-error" role="alert">
          {copy('advice.clipClearFailed')}
        </p>
      )}

      {anyLegacy &&
        (open === 'legacy' ? (
          <div className="view-field">
            <p className="view-note">{copy('advice.deleteLegacy')}</p>
            <ConfirmDestructive
              titleKey="label.confirmDeleteLegacy"
              word={CONFIRM_WORD}
              exportLabelKey="button.downloadLegacyJson"
              exportFilename={`fti-legacy-bundle-${stamp}.json`}
              /*
               * All THREE legacy keys, as raw text in one envelope, because all three are what
               * the confirmed action removes (security recommendation 10 / M5). It used to
               * export `fti.console.v2` alone, so the other two were destroyed with no copy
               * taken. Never a migrated projection: this is the last copy of whatever the
               * migration refused, so it has to be the bytes as stored. The empty string
               * covers keys that have gone since this row rendered -- the gate still has to be
               * passable, and an empty backup of nothing is honest about what was there.
               */
              exportText={() => readLegacyBundle() ?? ''}
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
