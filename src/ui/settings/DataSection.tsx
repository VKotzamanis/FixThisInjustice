import { useState, type JSX } from 'react';
import { displayClass } from '../format/display';

import { ConfirmDestructive } from '../components/ConfirmDestructive';
import { useCopy } from '../../content/useCopy';
import { todayLocal } from '../../domain/dates';
import { clearAssetStorage } from '../../domain/motivation/assets';
import { useAppStore } from '../../store';
import { ExportView } from '../views/ExportView';

/**
 * The Data section of Settings: the exports and the wipe (P7 Task 6, master plan section 3).
 *
 * It is one SETTINGS_ROWS entry, and it is a component rather than an inline fragment because
 * it holds state: whether the wipe's confirmation panel is open, and whether the last wipe left
 * the clip behind. `SettingsRow.render` is a plain function called during SettingsView's render,
 * so a hook could not live there.
 *
 * NOTHING HERE FOR THE OLD CONSOLE. Its import, the reopen offer and the control that deleted
 * its three keys are gone (ROADMAP N5, owner ruling 2026-10-18). A device that still holds
 * those keys keeps them as stored: removing a user's data is not this code's decision.
 *
 * WHY THE WIPE SITS BEHIND A TRIGGER. Security finding H2: the legacy console put a one-tap
 * wipe in the footer of every screen. The confirmation panel is not mounted until its trigger
 * is pressed, so there is no always-visible wipe control, and the panel that does mount holds
 * the two gates master plan section 3 requires of every destructive action -- a completed
 * export, then a typed word (ConfirmDestructive owns both). The panel is a named
 * `role="group"` because the Replace confirmation in ExportView, mounted by this same section
 * above it, is the same component and can be open at the same time.
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

type OpenPanel = 'none' | 'wipe';

export function DataSection(): JSX.Element {
  const t = useCopy();
  const profile = useAppStore((s) =>
    s.activeProfileId === null ? null : (s.profiles[s.activeProfileId] ?? null),
  );
  const [open, setOpen] = useState<OpenPanel>('none');
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

  return (
    <>
      {/*
       * Export first, and it renders its own heading. A user who arrives here to destroy
       * something passes the control that keeps a copy of it on the way in.
       */}
      <ExportView />

      <h2 className={displayClass(t('hero.dataOnDevice'))}>{t('hero.dataOnDevice')}</h2>
      <p className="view-note">{t('advice.dataOnDevice')}</p>

      {open === 'wipe' ? (
        <div className="view-field">
          <p className="view-note">{t('advice.wipeRemoves')}</p>
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
          onClick={() => {
            setOpen('wipe');
          }}
        >
          {t('button.wipeAll')}
        </button>
      )}

      {clipUncleared && (
        <p className="view-error" role="alert">
          {t('advice.clipClearFailed')}
        </p>
      )}
    </>
  );
}
