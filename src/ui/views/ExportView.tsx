import { CALENDAR_DAYS } from '../../config/export'; // [d]
import { useId, useState, type JSX } from 'react';
import { displayClass } from '../format/display';
import { FORMAT } from '../../content/copy';
import { useCopy } from '../../content/useCopy';
import { buildIcs } from '../../domain/export/ics';
import type { IcsEvent } from '../../domain/export/ics';
import { buildSummary } from '../../domain/export/summary';
import { todayLocal } from '../../domain/dates';
import { projectedCalendar } from '../../domain/schedule/calendar';
import { isTerminal } from '../../domain/schedule/cursor';
import { sessionTitle } from '../../domain/schedule/rotation';
import { useAppStore, selectState } from '../../store';
import { importJson as readImport } from '../../store/persistence';
import { downloadText } from '../../app/download';
import { saveFile } from '../../app/saveFile';
import { ConfirmDestructive } from '../components/ConfirmDestructive';
import { CONFIRM_WORD } from '../components/confirmWord';
import './views.css';

/**
 * Export, calendar and validated import.
 *
 * MOUNTING. Self-contained: it renders its own heading and reads everything it needs from
 * the store, so it drops into `SETTINGS_ROWS` in src/ui/views/SettingsView.tsx as one row
 * (`{ id: 'export', render: () => <ExportView /> }`), the insertion point that file
 * documents. Nothing else has to change. It is equally mountable as its own nav tab, which
 * would instead cost a `ViewId` member, a `NAV` entry and a `nav.export` copy key in
 * src/app/App.tsx.
 *
 * THE IMPORT PATH. Two phases, and the store is the only writer.
 *
 *   Check   `importJson` in src/store/persistence.ts: JSON, schema version, then record by
 *           record through assembleState, the load path (audit B04). Writes nothing. Records it
 *           cannot read are listed, every reason, and Replace leaves them out.
 *   Replace `useAppStore.getState().importJson(text)`, which re-reads through the same
 *           function and commits through `replaceState`.
 *
 * Master plan section 8 makes `importJson` the only path into the store for imported data,
 * which is what closes the import race the old app had (code review A43) and the unvalidated
 * write (security C1). This view never calls `replaceState` itself and never touches storage.
 *
 * THE CONFIRMATION. Replacing every record on the device is a destructive action, so master
 * plan section 3 applies in full: a typed `DELETE`, gated behind a JSON export taken in this
 * same panel. The gate is a real one, not a nag: the control stays disabled until the user
 * has a copy of what is about to be overwritten. The reason it is a typed confirmation rather
 * than a framing defence is master plan section 1.12: GitHub Pages cannot set response
 * headers and `frame-ancestors` is not supported in a `<meta>` element, so a confirmation the
 * user has to type is what a clickjacked frame cannot produce.
 *
 * Both gates are held by `ConfirmDestructive`, not by this view (P7 Task 6 review, item 2).
 * The field and the disabled rule were written here a second time, which is how the app came
 * to hold two typed-confirmation implementations and one anonymous panel; the component is now
 * the only one, and it names itself, so the Settings wipe panel and this one are two distinct
 * regions when both are on screen.
 *
 * The panel asks for its OWN download. `exported` is component state, deliberately: the three
 * downloads at the top of this view can have been pressed long before a document was pasted,
 * and a copy of some earlier state is not a copy of what Replace is about to overwrite. The
 * alternative -- a property that pre-arms the gate from this view's own `backedUp` flag --
 * would reverse the finding ConfirmDestructive was extracted to hold, so the download is asked
 * for inside the panel instead.
 */


/** [h] and [min] before each session at which the courtesy alarm fires. */
const ALARM_LEAD_HOURS = 2;
const ALARM_LEAD_MINUTES = ALARM_LEAD_HOURS * 60;


export function ExportView(): JSX.Element {
  const t = useCopy();
  /*
   * The two store actions are called through getState() rather than selected. A selector that
   * returns a bound method trips @typescript-eslint/unbound-method, and neither action needs a
   * subscription: they are invoked from event handlers, never read during render. The two
   * selectors below DO subscribe, because the heading, the filenames and the disabled state
   * all have to follow a profile change.
   */
  const profileId = useAppStore((s) => s.activeProfileId);
  const profile = useAppStore((s) =>
    s.activeProfileId === null ? null : (s.profiles[s.activeProfileId] ?? null),
  );

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  // Audit B04: the records the checked file holds that this build cannot read, each reason.
  const [leftOut, setLeftOut] = useState<readonly string[]>([]);
  const [done, setDone] = useState(false);

  const textId = useId();
  const fileId = useId();

  // Filenames carry the profile's own civil date, never the device's (master plan section 3).
  const stamp = profile === null ? 'export' : todayLocal(profile.timezone, Date.now());

  /** The whole document, under the one stamped name every backup in the app now carries. */
  const stateFilename = `fti-state-${stamp}.json`;

  const downloadState = (): void => {
    // Audit B07: the share sheet where this browser can share the file (iPhone: Save to Files).
    saveFile(stateFilename, useAppStore.getState().exportJson());
  };

  const downloadSummary = (): void => {
    if (profileId === null) return;
    /*
     * selectState, not a JSON round trip through exportJson(). It is the store's own
     * projection of the persisted document and is exported for exactly this: an export that
     * silently dropped a field would drop it from the summary too, which is the failure it
     * was written to prevent. Re-parsing the serialised copy could only ADD a failure mode.
     */
    const state = selectState(useAppStore.getState());
    downloadText(
      `fti-summary-${stamp}.txt`,
      buildSummary(state, profileId, Date.now()),
      'text/plain;charset=utf-8',
    );
  };

  const downloadCalendar = (): void => {
    if (profileId === null || profile === null) return;
    const state = selectState(useAppStore.getState());
    const from = todayLocal(profile.timezone, Date.now());
    const events: IcsEvent[] = [];
    for (const day of projectedCalendar(state, profileId, from, CALENDAR_DAYS)) {
      if (day.paused || day.slot === null || day.projectedSession === null) continue;
      // A completed or skipped day is a record, not an appointment: nothing is left to
      // remind the user of. isTerminal takes a SessionAssignment, so the null case (no
      // assignment yet, i.e. still just a projection) is not terminal by construction.
      if (day.assignment !== null && isTerminal(day.assignment)) continue;
      events.push({
        // Stable across exports of the same session on the same day, so a re-import updates
        // the event a previous export created instead of duplicating it.
        uid: `${day.date}-${day.projectedSession.id}@fixthisinjustice`,
        date: day.date,
        startTime: day.slot.startTime,
        durationS: day.slot.expectedDurationS, // [s]
        summary: day.projectedSession.label,
        description: sessionTitle(
          { sessionsPerWeek: state.plans[state.cursors[profileId]?.planId ?? '']?.sessionsPerWeek ?? 0 },
          day.projectedSession,
        ),
        alarmLeadMinutes: ALARM_LEAD_MINUTES, // [min]
      });
    }
    try {
      downloadText(
        `fti-sessions-${stamp}.ics`,
        buildIcs(events, profile.timezone, Date.now()),
        'text/calendar;charset=utf-8',
      );
    } catch {
      // buildIcs refuses a zone it cannot resolve rather than falling back to the device's.
      // A stored zone this build's ICU data does not carry is the one way that happens.
      setError(t('advice.exportUnavailable'));
    }
  };

  /** Validates without writing. The store is not consulted and cannot change here. */
  const runCheck = (): void => {
    setDone(false);
    // Closed before it is reopened, so the panel remounts and both of its gates are re-armed
    // against the document that was just checked rather than the one before it.
    setChecked(false);
    setLeftOut([]);
    try {
      JSON.parse(text);
    } catch {
      setError(t('advice.importParseFailed'));
      return;
    }
    const read = readImport(text);
    if (!read.ok) {
      setError(FORMAT.importRejected(read.error));
      return;
    }
    setError(null);
    setLeftOut(read.quarantine.map((q) => q.reason));
    setChecked(true);
  };

  /** The only write. It re-validates inside the store, so nothing here is trusted twice. */
  const runImport = (): void => {
    const result = useAppStore.getState().importJson(text);
    if (!result.ok) {
      // Only reachable if the text changed between the check and this click.
      setError(FORMAT.importRejected(result.error));
      setChecked(false);
      return;
    }
    setError(null);
    setChecked(false);
    setLeftOut([]);
    setText('');
    setDone(true);
  };

  const readFile = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      setText(typeof reader.result === 'string' ? reader.result : '');
      setChecked(false);
      setError(null);
    };
    reader.onerror = () => {
      setError(t('advice.fileUnreadable'));
    };
    reader.readAsText(file);
  };

  return (
    <>
      <h2 className={displayClass(t('hero.exportImport'))}>{t('hero.exportImport')}</h2>

      <h3>{t('label.downloads')}</h3>
      <div className="view-field">
        <button type="button" onClick={downloadState}>
          {t('button.downloadJson')}
        </button>
        <button type="button" disabled={profileId === null} onClick={downloadSummary}>
          {t('button.downloadSummary')}
        </button>
        <button type="button" disabled={profileId === null} onClick={downloadCalendar}>
          {t('button.downloadCalendar')}
        </button>
      </div>
      <p className="view-note">{t('advice.jsonIsBackup')}</p>
      <p className="view-note">{FORMAT.calendarWindow(CALENDAR_DAYS)}</p>
      <p className="view-note">{FORMAT.calendarAlarmLead(ALARM_LEAD_HOURS)}</p>
      <p className="view-note">{t('advice.calendarAlarms')}</p>
      {profileId === null && <p className="view-note">{t('advice.noProfileSetupFirst')}</p>}

      <h3>{t('label.importSection')}</h3>
      <p className="view-note">{t('advice.importReplaces')}</p>
      <p className="view-note">{t('advice.importInvalidNoChange')}</p>

      <div className="view-field">
        <label htmlFor={textId}>{t('label.pasteExport')}</label>
        <textarea
          id={textId}
          rows={6}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setChecked(false);
            setError(null);
            setDone(false);
          }}
        />
      </div>

      <div className="view-field">
        <label htmlFor={fileId}>{t('label.chooseExportFile')}</label>
        <input
          id={fileId}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file !== undefined) readFile(file);
          }}
        />
      </div>

      <button type="button" disabled={text.trim() === ''} onClick={runCheck}>
        {t('button.checkImport')}
      </button>

      {error !== null && (
        <p className="view-error" role="alert">
          {error}
        </p>
      )}

      {checked && leftOut.length > 0 && (
        <div className="view-field" role="status">
          <p className="view-note">{FORMAT.importLeavesOut(leftOut.length)}</p>
          <ul>
            {leftOut.map((reason, i) => (
              <li key={`${String(i)}:${reason}`}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {checked && (
        <ConfirmDestructive
          titleKey="label.confirmReplace"
          word={CONFIRM_WORD}
          /*
           * 'Download backup', not this view's own 'Download JSON'. Two controls sharing one
           * accessible name in the same region cannot be told apart by a screen reader, and
           * the gate depends on pressing THIS one.
           */
          exportLabelKey="button.downloadBackup"
          exportFilename={stateFilename}
          /* Read when the user asks for it: the document to back up is the one Replace is
             about to overwrite, which is the one in the store at that moment. */
          exportText={() => useAppStore.getState().exportJson()}
          confirmLabelKey="button.replaceData"
          onConfirm={runImport}
          onCancel={() => {
            // Backing out of the confirmation, not of the check: the pasted text stays, so a
            // user who changed their mind about the word has not lost the document.
            setChecked(false);
          }}
        />
      )}

      {done && <p className="view-note">{t('status.importOk')}</p>}
    </>
  );
}
