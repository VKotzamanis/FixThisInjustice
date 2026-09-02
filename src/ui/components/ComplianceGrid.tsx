// src/ui/components/ComplianceGrid.tsx
//
// Session compliance, one row per ISO week and one cell per day the user actually trains on.
//
// Rewritten from the legacy console-shared.jsx ComplianceGrid, which had two defects:
//   A48  it built a 168-element day array and then called `cells.find(...)` inside a nested
//        render loop, about 14,000 comparisons per render. The assignments are indexed once
//        here, in one pass, and every cell is a Map lookup.
//   A48  it marked every day without a completed session non-compliant, so a rest day looked
//        identical to a failure. Only the days in `slotWeekdays` are drawn at all, and a day
//        the programme never assigned is marked "not planned", which is not a failure.
//
// The five marks are distinct on purpose:
//   completed / skipped   the two TERMINAL statuses, exactly as closeWeeks counts them
//                         (src/domain/schedule/weekly.ts)
//   missed                assigned, the day has passed, and it reached neither terminal status
//   planned               assigned, and the day has not passed yet
//   none                  never assigned: a rest day, or a slot the programme did not fill
//
// "The day has passed" is decided against the profile's own civil today, passed in by the
// view. Today itself counts as not passed: a session assigned for today has not been missed.

import type { ReactElement } from 'react';
import { FORMAT } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import type { CopyKey } from '../../content/copy';
import { addDays, compareLocalDate } from '../../domain/dates';
import type {
  AssignmentStatus,
  IsoWeekday,
  LocalDate,
  SessionAssignment,
} from '../../domain/types';

export type ComplianceMark = 'completed' | 'skipped' | 'missed' | 'planned' | 'none';

/** The copy key naming each mark. One table, so the cell text and its label cannot disagree. */
const MARK_COPY: Record<ComplianceMark, CopyKey> = {
  completed: 'status.markCompleted',
  skipped: 'status.markSkipped',
  missed: 'status.markMissed',
  planned: 'status.markPlanned',
  none: 'status.markNotPlanned',
};

/**
 * Token colours for the five marks. Inline rather than in a stylesheet because this task's
 * file list carries no CSS file; every value is a token from src/ui/styles/tokens.css, so the
 * grid stays skin-agnostic and a re-themed build recolours it without touching this module.
 */
const MARK_FILL: Record<ComplianceMark, string> = {
  completed: 'var(--accent)',
  skipped: 'var(--text-3)',
  missed: 'var(--danger)',
  planned: 'transparent',
  none: 'transparent',
};

/** The outline of each mark, so the two transparent marks are still visible and distinct. */
const MARK_BORDER: Record<ComplianceMark, string> = {
  completed: '1px solid var(--accent)',
  skipped: '1px solid var(--text-3)',
  missed: '1px solid var(--danger)',
  planned: '1px solid var(--line-2)',
  none: '1px dashed var(--line)',
};

export interface ComplianceGridProps {
  assignments: readonly SessionAssignment[];
  /** Monday of each week to display, ascending. */
  weekStarts: readonly LocalDate[];
  /** The weekdays the user has availability slots on, ascending. Rest days are absent. */
  slotWeekdays: readonly IsoWeekday[];
  /** The profile's civil today, which is what separates a missed day from one still to come. */
  today: LocalDate;
  /** Availability.weeklySessionTarget, the count each row is read against. */
  weeklySessionTarget: number; // [sessions/week]
}

/**
 * date -> status, built in one pass.
 *
 * A duplicate date is a corrupt document rather than a state the schedule can produce, and the
 * last entry wins, which is the same rule a Map built by insertion order gives everywhere else.
 */
export function buildStatusIndex(
  assignments: readonly SessionAssignment[],
): Map<LocalDate, AssignmentStatus> {
  const index = new Map<LocalDate, AssignmentStatus>();
  for (const a of assignments) index.set(a.date, a.status);
  return index;
}

/**
 * The mark for one day.
 *
 * @param status the assignment's status, or undefined when no session was assigned
 * @param date the day the cell stands for
 * @param today the profile's civil today
 */
export function markFor(
  status: AssignmentStatus | undefined,
  date: LocalDate,
  today: LocalDate,
): ComplianceMark {
  if (status === undefined) return 'none';
  if (status === 'completed') return 'completed';
  if (status === 'skipped') return 'skipped';
  // 'planned' and 'in-progress' are both unfinished. Which one it is says nothing about
  // compliance; whether the day has passed says everything.
  return compareLocalDate(date, today) < 0 ? 'missed' : 'planned';
}

/** Sessions completed inside one ISO week, counted the way closeWeeks counts them. */
function completedInWeek(
  assignments: readonly SessionAssignment[],
  monday: LocalDate,
): number {
  const sunday = addDays(monday, 6);
  let completed = 0; // [sessions]
  for (const a of assignments) {
    if (a.status !== 'completed') continue;
    if (compareLocalDate(a.date, monday) < 0) continue;
    if (compareLocalDate(sunday, a.date) < 0) continue;
    completed += 1;
  }
  return completed;
}

export function ComplianceGrid(props: ComplianceGridProps): ReactElement {
  const { assignments, weekStarts, slotWeekdays, today, weeklySessionTarget } = props;
  // Both hooks before the empty-grid return, so the hook count is the same on every path.
  const t = useCopy();
  const overrides = useCopyOverrides();

  if (weekStarts.length === 0) {
    return <p className="view-note">{t('advice.noWeeksYet')}</p>;
  }

  const index = buildStatusIndex(assignments);

  return (
    <div
      className="compliance"
      role="grid"
      aria-label={t('label.complianceGrid')}
      style={{ display: 'grid', gap: '0.25rem', fontVariantNumeric: 'tabular-nums' }}
    >
      {weekStarts.map((monday) => (
        <div
          className="compliance-row"
          role="row"
          key={monday}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <span className="compliance-week" role="rowheader">
            {FORMAT.complianceWeek(
              monday,
              completedInWeek(assignments, monday),
              weeklySessionTarget,
              overrides,
            )}
          </span>
          {slotWeekdays.map((weekday) => {
            // ISO weekdays are Monday-first, and `monday` is day 1, so the offset is weekday - 1.
            const date = addDays(monday, weekday - 1);
            const mark = markFor(index.get(date), date, today);
            return (
              <span
                key={date}
                role="gridcell"
                className={`compliance-cell ${mark}`}
                data-mark={mark}
                aria-label={FORMAT.complianceCell(date, t(MARK_COPY[mark]))}
                style={{
                  display: 'inline-block',
                  width: '0.85rem',
                  height: '0.85rem',
                  background: MARK_FILL[mark],
                  border: MARK_BORDER[mark],
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
