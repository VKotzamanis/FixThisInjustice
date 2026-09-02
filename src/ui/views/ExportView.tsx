import { useId, useState, type JSX } from 'react';
import { FORMAT, copy } from '../../content/copy';
import { buildIcs } from '../../domain/export/ics';
import type { IcsEvent } from '../../domain/export/ics';
import { buildSummary } from '../../domain/export/summary';
import { todayLocal } from '../../domain/dates';
import { projectedCalendar } from '../../domain/schedule/calendar';
import { isTerminal } from '../../domain/schedule/cursor';
import { parseState } from '../../domain/schema';
import { useAppStore, selectState } from '../../store';
import { downloadText } from '../../app/download';
import { ConfirmDestructive } from '../components/ConfirmDestructive';
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
 *   Check   JSON.parse, then `parseState` (Zod). Writes nothing, whatever the document says.
 *   Replace `useAppStore.getState().importJson(text)`, which re-validates through the same
 *           `parseState` and commits through `replaceState`.
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

/** [d] the horizon the .ics covers. The plan's constant: "The calendar holds the next 28 days". */
const CALENDAR_DAYS = 28;

/** [h] and [min] before each session at which the courtesy alarm fires. */
const ALARM_LEAD_HOURS = 2;
const ALARM_LEAD_MINUTES = ALARM_LEAD_HOURS * 60;

/** The word master plan section 3 fixes for every destructive confirmation. */
const CONFIRM_WORD = 'DELETE';

export function ExportView(): JSX.Element {
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
  const [done, setDone] = useState(false);

  const textId = useId();
  const fileId = useId();

  // Filenames carry the profile's own civil date, never the device's (master plan section 3).
  const stamp = profile === null ? 'export' : todayLocal(profile.timezone, Date.now());

  /** The whole document, under the one stamped name every backup in the app now carries. */
  const stateFilename = `fti-state-${stamp}.json`;

  const downloadState = (): void => {
    downloadText(stateFilename, useAppStore.getState().exportJson());
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
    downloadText(`fti-summary-${stamp}.txt`, buildSummary(state, profileId, Date.now()));
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
        description: day.projectedSession.name,
        alarmLeadMinutes: ALARM_LEAD_MINUTES, // [min]
      });
    }
    try {
      downloadText(`fti-sessions-${stamp}.ics`, buildIcs(events, profile.timezone, Date.now()));
    } catch {
      // buildIcs refuses a zone it cannot resolve rather than falling back to the device's.
      // A stored zone this build's ICU data does not carry is the one way that happens.
      setError(copy('advice.exportUnavailable'));
    }
  };

  /** Validates without writing. The store is not consulted and cannot change here. */
  const runCheck = (): void => {
    setDone(false);
    // Closed before it is reopened, so the panel remounts and both of its gates are re-armed
    // against the document that was just checked rather than the one before it.
    setChecked(false);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      setError(copy('advice.importParseFailed'));
      return;
    }
    const parsed = parseState(raw);
    if (!parsed.ok) {
      setError(FORMAT.importRejected(parsed.error));
      return;
    }
    setError(null);
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
      setError(copy('advice.fileUnreadable'));
    };
    reader.readAsText(file);
  };

  return (
    <>
      <h2>{copy('hero.exportImport')}</h2>

      <h3>{copy('label.downloads')}</h3>
      <div className="view-field">
        <button type="button" onClick={downloadState}>
          {copy('button.downloadJson')}
        </button>
        <button type="button" disabled={profileId === null} onClick={downloadSummary}>
          {copy('button.downloadSummary')}
        </button>
        <button type="button" disabled={profileId === null} onClick={downloadCalendar}>
          {copy('button.downloadCalendar')}
        </button>
      </div>
      <p className="view-note">{copy('advice.jsonIsBackup')}</p>
      <p className="view-note">{FORMAT.calendarWindow(CALENDAR_DAYS)}</p>
      <p className="view-note">{FORMAT.calendarAlarmLead(ALARM_LEAD_HOURS)}</p>
      <p className="view-note">{copy('advice.calendarAlarms')}</p>
      {profileId === null && <p className="view-note">{copy('advice.noProfileSetupFirst')}</p>}

      <h3>{copy('label.importSection')}</h3>
      <p className="view-note">{copy('advice.importReplaces')}</p>
      <p className="view-note">{copy('advice.importInvalidNoChange')}</p>

      <div className="view-field">
        <label htmlFor={textId}>{copy('label.pasteExport')}</label>
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
        <label htmlFor={fileId}>{copy('label.chooseExportFile')}</label>
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
        {copy('button.checkImport')}
      </button>

      {error !== null && (
        <p className="view-error" role="alert">
          {error}
        </p>
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

      {done && <p className="view-note">{copy('status.importOk')}</p>}
    </>
  );
}
