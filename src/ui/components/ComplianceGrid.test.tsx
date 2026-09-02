// Compliance grid: one row per ISO week, one cell per day the user says they train on.
//
// Deviations from the P7 plan's Task 4 Step 10 literal (recorded here; the plan is not edited):
//  - The component takes `today` and `weeklySessionTarget`. Without a civil today there is no
//    way to tell a session still to come from one that was MISSED, and the plan's draft marked
//    both "not planned", which is the rest-day defect (A48) in a second costume.
//  - Every label quotes src/content/copy.ts; the draft's literals would have shipped a view
//    whose copy and whose test could drift apart.
//  - The `// @vitest-environment jsdom` pragma is dropped: vitest.config.ts sets jsdom already.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FORMAT, copy } from '../../content/copy';
import type { AssignmentStatus, SessionAssignment } from '../../domain/types';
import { ComplianceGrid, buildStatusIndex, markFor } from './ComplianceGrid';

function assignment(date: string, status: AssignmentStatus): SessionAssignment {
  return {
    date,
    sessionId: 's-push',
    sourceIndex: 0,
    status,
    startedAt: null, // [ms] epoch, UTC
    completedAt: null, // [ms] epoch, UTC
    skipReason: null,
  };
}

/** Mondays of two consecutive ISO weeks, and the Monday/Wednesday/Friday slots inside them. */
const WEEK_STARTS = ['2026-01-05', '2026-01-12'];
const MWF = [1, 3, 5] as const; // ISO weekdays, Monday-first
/** Past the end of both weeks, so an unfinished planned day is unambiguously a miss. */
const AFTER = '2026-01-20';
const TARGET = 3; // [sessions/week]

describe('buildStatusIndex', () => {
  it('indexes every assignment by date in one pass', () => {
    const idx = buildStatusIndex([
      assignment('2026-01-05', 'completed'),
      assignment('2026-01-07', 'skipped'),
    ]);
    expect(idx.get('2026-01-05')).toBe('completed');
    expect(idx.get('2026-01-07')).toBe('skipped');
    expect(idx.get('2026-01-06')).toBeUndefined();
  });

  it('keeps the last assignment when a date somehow appears twice', () => {
    const idx = buildStatusIndex([
      assignment('2026-01-05', 'planned'),
      assignment('2026-01-05', 'completed'),
    ]);
    expect(idx.get('2026-01-05')).toBe('completed');
  });
});

describe('markFor', () => {
  it('reports the two terminal statuses as themselves', () => {
    expect(markFor('completed', '2026-01-05', AFTER)).toBe('completed');
    expect(markFor('skipped', '2026-01-05', AFTER)).toBe('skipped');
  });

  it('reports an unfinished day that has passed as missed', () => {
    expect(markFor('planned', '2026-01-05', AFTER)).toBe('missed');
    expect(markFor('in-progress', '2026-01-05', AFTER)).toBe('missed');
  });

  it('reports an unfinished day that has not passed as planned', () => {
    // Today itself is still live: a session assigned for today has not been missed.
    expect(markFor('planned', '2026-01-05', '2026-01-05')).toBe('planned');
    expect(markFor('planned', '2026-01-07', '2026-01-05')).toBe('planned');
  });

  it('reports a day the programme never assigned as not planned, past or future', () => {
    // A rest day is not a failure. The legacy grid marked every unassigned day
    // non-compliant (code review A48), which made a correct week look like a broken one.
    expect(markFor(undefined, '2026-01-06', AFTER)).toBe('none');
    expect(markFor(undefined, '2026-02-06', AFTER)).toBe('none');
  });
});

describe('ComplianceGrid', () => {
  it('renders one cell per slot day per week, and never a rest day', () => {
    render(
      <ComplianceGrid
        assignments={[]}
        weekStarts={WEEK_STARTS}
        slotWeekdays={[...MWF]}
        today={AFTER}
        weeklySessionTarget={TARGET}
      />,
    );
    expect(screen.getAllByRole('gridcell')).toHaveLength(6);
    // Tuesday is not a slot day, so it has no cell at all.
    expect(screen.queryByLabelText(/2026-01-06/)).toBeNull();
  });

  it('marks each slot day as completed, skipped or missed', () => {
    render(
      <ComplianceGrid
        assignments={[assignment('2026-01-05', 'completed'), assignment('2026-01-07', 'skipped')]}
        weekStarts={WEEK_STARTS}
        slotWeekdays={[...MWF]}
        today={AFTER}
        weeklySessionTarget={TARGET}
      />,
    );
    expect(
      screen.getByLabelText(FORMAT.complianceCell('2026-01-05', copy('status.markCompleted'))),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(FORMAT.complianceCell('2026-01-07', copy('status.markSkipped'))),
    ).toBeTruthy();
    // Assigned for a day that has passed and never finished.
    expect(
      screen.getAllByLabelText(FORMAT.complianceCell('2026-01-09', copy('status.markNotPlanned'))),
    ).toHaveLength(1);
  });

  it('marks an assigned day that passed unfinished as missed', () => {
    render(
      <ComplianceGrid
        assignments={[assignment('2026-01-09', 'planned')]}
        weekStarts={WEEK_STARTS}
        slotWeekdays={[...MWF]}
        today={AFTER}
        weeklySessionTarget={TARGET}
      />,
    );
    expect(
      screen.getByLabelText(FORMAT.complianceCell('2026-01-09', copy('status.markMissed'))),
    ).toBeTruthy();
  });

  it('states each week against its own session target', () => {
    render(
      <ComplianceGrid
        assignments={[
          assignment('2026-01-05', 'completed'),
          assignment('2026-01-07', 'completed'),
          assignment('2026-01-09', 'skipped'),
          assignment('2026-01-12', 'completed'),
        ]}
        weekStarts={WEEK_STARTS}
        slotWeekdays={[...MWF]}
        today={AFTER}
        weeklySessionTarget={TARGET}
      />,
    );
    const rows = screen.getAllByRole('rowheader').map((n) => n.textContent);
    expect(rows).toEqual([
      FORMAT.complianceWeek('2026-01-05', 2, TARGET),
      FORMAT.complianceWeek('2026-01-12', 1, TARGET),
    ]);
  });

  it('counts only the week it belongs to', () => {
    render(
      <ComplianceGrid
        assignments={[assignment('2026-01-11', 'completed')]} // Sunday of the first week
        weekStarts={WEEK_STARTS}
        slotWeekdays={[...MWF]}
        today={AFTER}
        weeklySessionTarget={TARGET}
      />,
    );
    const rows = screen.getAllByRole('rowheader').map((n) => n.textContent);
    expect(rows[0]).toBe(FORMAT.complianceWeek('2026-01-05', 1, TARGET));
    expect(rows[1]).toBe(FORMAT.complianceWeek('2026-01-12', 0, TARGET));
  });

  it('renders nothing but a message when there are no weeks yet', () => {
    render(
      <ComplianceGrid
        assignments={[]}
        weekStarts={[]}
        slotWeekdays={[1]}
        today={AFTER}
        weeklySessionTarget={TARGET}
      />,
    );
    expect(screen.getByText(copy('advice.noWeeksYet'))).toBeTruthy();
    expect(screen.queryAllByRole('gridcell')).toHaveLength(0);
  });
});
