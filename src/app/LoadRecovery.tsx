// src/app/LoadRecovery.tsx
//
// Audit B01/B17/B18: the stored document was refused (invalid) or unreachable. Every write is
// paused (src/store/index.ts canPersist) until the user imports a backup or clears the stored
// data, and this screen says so, in place of the intro, the boot sequence, setup and the views,
// which used to hide the problem and silently drop everything entered afterwards.
import { useState, type ReactElement } from 'react';
import { FORMAT } from '../content/copy';
import { useCopy } from '../content/useCopy';
import { useAppStore } from '../store';
import { ConfirmDestructive } from '../ui/components/ConfirmDestructive';
import { CONFIRM_WORD } from '../ui/components/confirmWord';

export function LoadRecovery(): ReactElement {
  const t = useCopy();
  // The raw stored text, snapshotted at hydrate (null when nothing could be read); the export.
  const raw = useAppStore((s) => s.status.lastLoadRaw);
  // B17: the heading names the cause the load reported, not whether some text was readable: an
  // unreachable database with a readable fti.v3 is still unavailable storage.
  const failure = useAppStore((s) => s.status.loadFailure);
  const [importError, setImportError] = useState<string | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);

  const readFile = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      // importJson validates with the loader's schema and, on success, reopens writing.
      const result = useAppStore.getState().importJson(text);
      setImportError(result.ok ? null : FORMAT.importRejected(result.error));
    };
    reader.onerror = () => {
      setImportError(t('advice.fileUnreadable'));
    };
    reader.readAsText(file);
  };

  return (
    <section className="view recovery-screen" aria-labelledby="recovery-heading">
      <h1 id="recovery-heading">
        {t(failure === 'unavailable' ? 'hero.storageUnreadable' : 'hero.storedDataRefused')}
      </h1>
      <p>{t('status.writesPaused')}</p>
      <div className="view-field">
        <label htmlFor="recovery-import">{t('label.importBackup')}</label>
        <input
          id="recovery-import"
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file !== undefined) readFile(file);
          }}
        />
      </div>
      {importError !== null && (
        <p className="wiz-error" role="alert">
          {importError}
        </p>
      )}
      {wipeOpen ? (
        <ConfirmDestructive
          titleKey="label.confirmWipe"
          word={CONFIRM_WORD}
          exportLabelKey="button.exportStoredData"
          exportFilename="fixthisinjustice-recovery.json"
          // B04: the backup is the STORED text being destroyed, not the in-memory default.
          exportText={() => raw ?? '{}'}
          confirmLabelKey="button.wipeConfirm"
          onConfirm={() => {
            useAppStore.getState().wipeAll();
            setWipeOpen(false);
          }}
          onCancel={() => {
            setWipeOpen(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setWipeOpen(true);
          }}
        >
          {t('button.wipeAll')}
        </button>
      )}
    </section>
  );
}
