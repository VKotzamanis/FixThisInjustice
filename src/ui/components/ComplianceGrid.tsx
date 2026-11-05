// src/ui/components/ComplianceGrid.tsx
//
// Session compliance, one row per ISO week and one cell per day, Monday to Sunday. Every cell's
// state comes from the schedule model (src/domain/schedule/compliance.ts, audit D06), never from
// whether an assignment row happens to exist: rows are materialised only when a day is opened,
// so a missed Monday used to read "Not planned".
//
// Seven columns, not only the preferred weekdays: any day is trainable (spec R3), and a session
// made up on a Tuesday has to be visible in the week it counts toward.
//
// The marks are DRAWN by StatusMark (stylize survey 2026-10-18, item 6), the set the Today strip
// uses too, so each differs by shape and not only by fill. A day outside the programme's span
// draws no mark at all.

import type { ReactElement } from 'react';
import { FORMAT } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import type { CopyKey } from '../../content/copy';
import type { ComplianceWeek, DayMark } from '../../domain/schedule/compliance';
import { StatusMark } from './StatusMark';

/** The copy key naming each mark. One table, so the cell text and its label cannot disagree. */
const MARK_COPY: Record<DayMark, CopyKey> = {
  completed: 'status.markCompleted',
  skipped: 'status.markSkipped',
  'in-progress': 'status.dayInProgress',
  missed: 'status.markMissed',
  planned: 'status.markPlanned',
  postponed: 'status.markPostponed',
  paused: 'status.dayPaused',
  none: 'status.markNotPlanned',
  blank: 'status.markOutsideProgramme',
};

export interface ComplianceGridProps {
  /** One entry per week to display, ascending (complianceWeek, src/domain/schedule/compliance.ts). */
  weeks: readonly ComplianceWeek[];
}

export function ComplianceGrid(props: ComplianceGridProps): ReactElement {
  const { weeks } = props;
  // Both hooks before the empty-grid return, so the hook count is the same on every path.
  const t = useCopy();
  const overrides = useCopyOverrides();

  if (weeks.length === 0) {
    return <p className="view-note">{t('advice.noWeeksYet')}</p>;
  }

  return (
    <div
      className="compliance"
      role="grid"
      aria-label={t('label.complianceGrid')}
      style={{ display: 'grid', gap: '0.25rem', fontVariantNumeric: 'tabular-nums' }}
    >
      {weeks.map((week) => (
        <div
          className="compliance-row"
          role="row"
          key={week.monday}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          {/* The screen shows the date and the two counts; the sentence is the row's name for
              a screen reader (owner 2026-10-18: the Log was "too verbose"). */}
          <span
            className="compliance-week"
            role="rowheader"
            aria-label={FORMAT.complianceWeek(week.monday, week.completed, week.target, overrides)}
          >
            {FORMAT.complianceWeekShort(week.monday, week.completed, week.target)}
          </span>
          {week.days.map((day) => (
            <span
              key={day.date}
              role="gridcell"
              className={`compliance-cell ${day.mark}`}
              data-mark={day.mark}
              data-date={day.date}
              aria-label={FORMAT.complianceCell(day.date, t(MARK_COPY[day.mark]))}
            >
              {/* The cell's aria-label names it, so the mark itself is aria-hidden. */}
              {day.mark === 'blank' ? (
                <span className="status-mark" aria-hidden="true" />
              ) : (
                <StatusMark kind={day.mark} />
              )}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
