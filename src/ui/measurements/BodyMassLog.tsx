// src/ui/measurements/BodyMassLog.tsx
//
// Spec R9 / audit G03: every weigh-in, newest first, each editable in place and deletable with a
// 6 s Undo that restores the identical record. A typo no longer poisons Targets and the chart
// forever.
import { useId, useMemo, useState, type ReactElement } from 'react';
import { useCopy } from '../../content/useCopy';
import { compareLocalDate } from '../../domain/dates';
import { latestTrendEntry } from '../../domain/measurements';
import type { BodyMassEntry, Profile } from '../../domain/types';
import { formatMass } from '../../domain/units';
import { useAppStore } from '../../store';
import { UNDO_WINDOW_MS } from '../../store/training';
import { useToasts } from '../components/ToastQueue';
import { BodyMassForm, MASS_ROLE_KEY } from './BodyMassForm';
import './measurements.css';

/** [entries] Shown before Show All: two weeks of daily weigh-ins. Display only. */
export const BODY_MASS_ROWS_SHOWN = 14;

const NO_ENTRIES: readonly BodyMassEntry[] = [];

export function BodyMassLog(props: { profile: Profile }): ReactElement | null {
  const { profile } = props;
  const c = useCopy();
  const { push } = useToasts();
  const headingId = useId();
  const stored = useAppStore((s) => s.bodyMass[profile.id] ?? NO_ENTRIES);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Newest first: civil date, then the instant it was entered.
  const rows = useMemo(
    () => [...stored].sort((a, b) => compareLocalDate(b.date, a.date) || b.loggedAt - a.loggedAt),
    [stored],
  );
  if (rows.length === 0) return null;
  const shown = showAll ? rows : rows.slice(0, BODY_MASS_ROWS_SHOWN);

  /** [kg] An edit is compared with the newest OTHER trend point, never with the typo itself. */
  const referenceFor = (id: string): number =>
    latestTrendEntry(stored.filter((e) => e.id !== id))?.massKg ?? profile.body.baselineMassKg;

  const remove = (e: BodyMassEntry): void => {
    const removed = useAppStore.getState().deleteBodyMass(profile.id, e.id);
    if (removed === null) return;
    push({
      kind: 'undo',
      message: c('status.massDeleted'),
      deadlineAt: Date.now() + UNDO_WINDOW_MS, // [ms] epoch UTC
      onUndo: () => {
        try {
          useAppStore.getState().restoreBodyMass(removed);
        } catch {
          // The profile is gone; there is nothing to restore into.
        }
      },
    });
  };

  return (
    <section className="measurements" aria-labelledby={headingId}>
      <h3 id={headingId}>{c('hero.measurements')}</h3>
      <ul className="mass-log">
        {shown.map((e) => (
          <li key={e.id} className="mass-log-row" data-testid="mass-entry">
            {editingId === e.id ? (
              <BodyMassForm
                profile={profile}
                idPrefix={`mass-edit-${e.id}`}
                quantity={c('quantity.bodyMass')}
                role="choose"
                referenceKg={referenceFor(e.id)}
                initialKg={e.massKg}
                initialRole={e.role ?? null}
                submitLabel={c('button.saveEntry')}
                onSubmit={(massKg, role) => {
                  try {
                    useAppStore.getState().updateBodyMass(profile.id, e.id, {
                      massKg, // [kg]
                      enteredUnit: profile.units,
                      bodyFatPct: e.bodyFatPct, // [%] unchanged by a mass edit
                      role,
                    });
                  } catch {
                    return false;
                  }
                  setEditingId(null);
                  return true;
                }}
                onCancel={() => {
                  setEditingId(null);
                }}
              />
            ) : (
              <>
                <span className="mass-log-date">{e.date}</span>
                <span className="mass-log-value">{formatMass(e.massKg, profile.units)}</span>
                {e.bodyFatPct !== null && <span className="mass-log-fat">{`${String(e.bodyFatPct)} %`}</span>}
                {e.role !== undefined && <span className="mass-log-role">{c(MASS_ROLE_KEY[e.role])}</span>}
                <span className="mass-log-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(e.id);
                    }}
                  >
                    {c('button.editEntry')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      remove(e);
                    }}
                  >
                    {c('button.deleteEntry')}
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {!showAll && rows.length > shown.length && (
        <button
          type="button"
          onClick={() => {
            setShowAll(true);
          }}
        >
          {c('button.showAllEntries')}
        </button>
      )}
    </section>
  );
}
