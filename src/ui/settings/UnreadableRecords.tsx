// src/ui/settings/UnreadableRecords.tsx
//
// Spec R13 / audit B01, B04, B10: what the last load could not read (kept on disk exactly as
// stored, never written over) and which stored answers a schema repair replaced. Listed, and
// exportable as stored, so nothing is lost silently and nothing needs hand-editing on a phone.
import type { JSX } from 'react';
import { downloadText } from '../../app/download';
import { FORMAT } from '../../content/copy';
import { useCopy } from '../../content/useCopy';
import { useAppStore } from '../../store';
import { exportUnreadable } from '../../store/persistence';
import { displayClass } from '../format/display';

export function UnreadableRecords(): JSX.Element | null {
  const t = useCopy();
  const quarantine = useAppStore((s) => s.status.quarantine);
  const repairs = useAppStore((s) => s.status.repairs);
  const records = quarantine ?? [];
  const repaired = repairs ?? [];
  if (records.length === 0 && repaired.length === 0) return null;
  return (
    <section aria-labelledby="unreadable-records-heading">
      <h2 id="unreadable-records-heading" className={displayClass(t('hero.unreadableRecords'))}>
        {t('hero.unreadableRecords')}
      </h2>
      <p className="view-note">{t('advice.unreadableRecordsKept')}</p>
      <ul>
        {records.map((r) => (
          <li key={`${r.store}/${r.key}/${String(r.index)}`}>{r.reason}</li>
        ))}
        {repaired.map((r) => (
          <li key={`${r.key}/${r.path.join('.')}`}>
            {FORMAT.repairedAnswer(
              [r.store, r.key, ...r.path].join('.'),
              JSON.stringify(r.stored),
              JSON.stringify(r.readAs),
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          downloadText('fti-unreadable-records.json', exportUnreadable(records, repaired));
        }}
      >
        {t('button.exportUnreadable')}
      </button>
    </section>
  );
}
