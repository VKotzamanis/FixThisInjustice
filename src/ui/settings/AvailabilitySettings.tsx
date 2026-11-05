// src/ui/settings/AvailabilitySettings.tsx
//
// Training days, start times and the weekly target after setup (audit D05). Before this, the
// only way to change them was Wipe All. Calendar only: the running plan and its cursor are not
// touched (docs/design/programme-lifecycle.md keeps re-planning behind Update Programme).
//
// The form is local until Save Days; Save goes through the store's updateAvailability, which
// grades every ended week under the old days first (D16) and parses the new availability with
// the loader's schema (spec R5). A refusal is shown here, beside the control that raised it.
import { useState, type JSX } from 'react';
import { FORMAT } from '../../content/copy';
import { useCopy } from '../../content/useCopy';
import { isValidLocalTime } from '../../domain/dates';
import type { Availability, IsoWeekday, Profile, Seconds } from '../../domain/types';
import { useAppStore } from '../../store';
import { displayClass } from '../format/display';
import { WEEKDAYS } from '../setup/SetupWizard';

interface DayRow {
  enabled: boolean;
  startTime: string; // "HH:mm" in the profile's zone, as typed
}

type DayRows = Record<IsoWeekday, DayRow>;

/** The stored slots as one row per weekday; an unused day starts at the first slot's time. */
function rowsOf(a: Availability): DayRows {
  const fallback = a.slots[0]?.startTime ?? '';
  const rows = {} as DayRows;
  for (const d of WEEKDAYS) {
    const slot = a.slots.find((s) => s.weekday === d.value);
    rows[d.value] = { enabled: slot !== undefined, startTime: slot?.startTime ?? fallback };
  }
  return rows;
}

/**
 * [s] The expected duration a day keeps: its own slot's, else the first slot's. The editor does
 * not ask for durations (the wizard does); a newly added day inherits the one already chosen.
 */
function durationOf(a: Availability, weekday: IsoWeekday): Seconds {
  return (a.slots.find((s) => s.weekday === weekday) ?? a.slots[0])?.expectedDurationS ?? 0;
}

export function AvailabilitySettings(props: { profile: Profile }): JSX.Element | null {
  const stored = useAppStore((s) => s.availability[props.profile.id] ?? null);
  if (stored === null) return null;
  // Keyed by the stored value, so a successful save (or an import) reseeds the form from it.
  return <AvailabilityForm key={JSON.stringify(stored)} profileId={props.profile.id} stored={stored} />;
}

function AvailabilityForm(props: { profileId: string; stored: Availability }): JSX.Element {
  const t = useCopy();
  const { profileId, stored } = props;
  const [days, setDays] = useState<DayRows>(() => rowsOf(stored));
  const [target, setTarget] = useState<number>(stored.weeklySessionTarget); // [sessions/week]
  const [refused, setRefused] = useState(false);

  const enabled = WEEKDAYS.filter((d) => days[d.value].enabled);
  // [sessions/week] bounded by the days, as AvailabilitySchema requires; shown and saved as one.
  const shownTarget = Math.max(1, Math.min(target, enabled.length));
  const dayError = enabled.length === 0 ? t('error.pickOneDay') : null;
  const timeError = (weekday: IsoWeekday): string | null =>
    isValidLocalTime(days[weekday].startTime) ? null : t('error.startTimeRequired');
  const valid = dayError === null && enabled.every((d) => timeError(d.value) === null);

  const candidate: Availability = {
    slots: enabled.map((d) => ({
      weekday: d.value,
      startTime: days[d.value].startTime,
      expectedDurationS: durationOf(stored, d.value), // [s]
    })),
    weeklySessionTarget: shownTarget, // [sessions/week]
  };
  const changed = JSON.stringify(candidate) !== JSON.stringify(stored);

  const patchDay = (weekday: IsoWeekday, next: Partial<DayRow>): void => {
    setRefused(false);
    setDays((rows) => ({ ...rows, [weekday]: { ...rows[weekday], ...next } }));
  };

  const onSave = (): void => {
    try {
      useAppStore.getState().updateAvailability(profileId, candidate, Date.now()); // [ms] epoch, UTC
    } catch {
      // The store wrote nothing (spec R5); say so here rather than letting the throw escape.
      setRefused(true);
    }
  };

  return (
    <>
      <h2 className={displayClass(t('hero.trainingDays'))}>{t('hero.trainingDays')}</h2>
      <p className="view-note">{t('advice.trainingDaysCalendarOnly')}</p>
      {WEEKDAYS.map((d) => (
        <div key={d.value}>
          <label className="view-inline">
            <input
              id={`avail-day-${String(d.value)}`}
              type="checkbox"
              checked={days[d.value].enabled}
              onChange={(e) => {
                patchDay(d.value, { enabled: e.target.checked });
              }}
            />
            {t(d.labelKey)}
          </label>
          {days[d.value].enabled && (
            <div className="view-field">
              <label htmlFor={`avail-start-${String(d.value)}`}>
                {FORMAT.slotField(t(d.labelKey), t('label.startTime'))}
              </label>
              <input
                id={`avail-start-${String(d.value)}`}
                type="time"
                required
                aria-invalid={timeError(d.value) !== null}
                value={days[d.value].startTime}
                onChange={(e) => {
                  patchDay(d.value, { startTime: e.target.value });
                }}
              />
              {timeError(d.value) !== null && <p className="view-error">{timeError(d.value)}</p>}
            </div>
          )}
        </div>
      ))}
      {dayError !== null && <p className="view-error">{dayError}</p>}
      <div className="view-field">
        <label htmlFor="avail-target">{t('quantity.weeklySessionTarget')}</label>
        <select
          id="avail-target"
          value={String(shownTarget)}
          onChange={(e) => {
            setRefused(false);
            setTarget(Number(e.target.value));
          }}
        >
          {Array.from({ length: Math.max(1, enabled.length) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <button type="button" id="avail-save" disabled={!valid || !changed} onClick={onSave}>
        {t('button.saveTrainingDays')}
      </button>
      {refused && (
        <p className="view-error" role="alert">
          {t('error.availabilityRefused')}
        </p>
      )}
    </>
  );
}
