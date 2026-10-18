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
import { FORMAT, copyFor } from '../../content/copy';
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
      screen.getByLabelText(FORMAT.complianceCell('2026-01-05', copyFor('limelight', 'status.markCompleted'))),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(FORMAT.complianceCell('2026-01-07', copyFor('limelight', 'status.markSkipped'))),
    ).toBeTruthy();
    // Assigned for a day that has passed and never finished.
    expect(
      screen.getAllByLabelText(FORMAT.complianceCell('2026-01-09', copyFor('limelight', 'status.markNotPlanned'))),
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
      screen.getByLabelText(FORMAT.complianceCell('2026-01-09', copyFor('limelight', 'status.markMissed'))),
    ).toBeTruthy();
  });

  it('draws each cell with the shared status mark, its shape matching its state', () => {
    // Stylize survey item 6: the grid's skipped and missed cells used to differ only in fill
    // luminance. Each cell now holds the StatusMark of its state, hidden from assistive
    // technology because the gridcell's own aria-label (asserted above) already names it.
    render(
      <ComplianceGrid
        assignments={[
          assignment('2026-01-05', 'completed'),
          assignment('2026-01-07', 'skipped'),
          assignment('2026-01-09', 'planned'),
          assignment('2026-01-14', 'planned'),
        ]}
        weekStarts={WEEK_STARTS}
        slotWeekdays={[...MWF]}
        today={AFTER}
        weeklySessionTarget={TARGET}
      />,
    );
    const cells = screen.getAllByRole('gridcell');
    const shapes = new Map<string, string>();
    for (const cell of cells) {
      const mark = cell.querySelector('svg.status-mark');
      expect(mark).not.toBeNull();
      expect(mark?.getAttribute('data-mark')).toBe(cell.getAttribute('data-mark'));
      expect(mark?.getAttribute('aria-hidden')).toBe('true');
      // No inline colour: the fills live in statusMark.css, token-only.
      expect(cell.getAttribute('style')).toBeNull();
      shapes.set(cell.getAttribute('data-mark') ?? '', mark?.getAttribute('data-shape') ?? '');
    }
    expect([...shapes.keys()].sort()).toEqual(['completed', 'missed', 'none', 'skipped']);
    expect(new Set(shapes.values()).size).toBe(shapes.size);
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
    const rows = screen.getAllByRole('rowheader').map((n) => n.getAttribute('aria-label'));
    expect(rows).toEqual([
      FORMAT.complianceWeek('2026-01-05', 2, TARGET),
      FORMAT.complianceWeek('2026-01-12', 1, TARGET),
    ]);
  });

  it('shows each week as its date and count, and keeps the sentence as the row name', () => {
    // Owner 2026-10-18, Log "Too verbose": "Week of ... completed" on every row repeated what the
    // heading says. The sentence stays the accessible name; the screen shows the two counts.
    render(
      <ComplianceGrid
        assignments={[assignment('2026-01-05', 'completed'), assignment('2026-01-07', 'completed')]}
        weekStarts={WEEK_STARTS}
        slotWeekdays={[...MWF]}
        today={AFTER}
        weeklySessionTarget={TARGET}
      />,
    );
    expect(screen.getAllByRole('rowheader').map((n) => n.textContent)).toEqual([
      FORMAT.complianceWeekShort('2026-01-05', 2, TARGET),
      FORMAT.complianceWeekShort('2026-01-12', 0, TARGET),
    ]);
    expect(screen.getByRole('rowheader', { name: FORMAT.complianceWeek('2026-01-05', 2, TARGET) })).toBeTruthy();
    expect(screen.queryByText(FORMAT.complianceWeek('2026-01-05', 2, TARGET))).toBeNull();
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
    const rows = screen.getAllByRole('rowheader').map((n) => n.getAttribute('aria-label'));
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
    expect(screen.getByText(copyFor('limelight', 'advice.noWeeksYet'))).toBeTruthy();
    expect(screen.queryAllByRole('gridcell')).toHaveLength(0);
  });
});

/*
 * The Log screenshot of 2026-10-18 (alpha fixture) showed "3 of 3 completed" rows with ONE
 * completed mark and two empty "not planned" rings. Reproduced here with explicit state, both
 * ways round, to tell a grid defect from a fixture artefact:
 *
 *  - three sessions completed ON the slot days draw three completed marks: the day mapping and
 *    the StatusMark mapping are right;
 *  - the fixture's shape (slots Mon/Wed/Fri, sessions on Fri/Sun/Tue: scripts/alpha-fixture.mjs
 *    walks `63 - (week * 7 + day * 2)` days back from Friday 2026-09-04) draws exactly the
 *    screenshot: Friday completed, Monday and Wednesday unassigned. The row counts the week the
 *    way closeWeeks does, every completed session Monday to Sunday ('counts only the week it
 *    belongs to' above), so it still reads 3 of 3.
 *
 * The app cannot produce the second shape: a session is served only on a slot day
 * (src/domain/schedule/calendar.ts projectedCalendar), and slots are written once, by the setup
 * wizard that creates the profile.
 */
describe('a 3-of-3 week (the Log screenshot of 2026-10-18)', () => {
  const MONDAY = '2026-08-24';
  const marksOf = (): (string | null)[] =>
    screen.getAllByRole('gridcell').map((cell) => cell.getAttribute('data-mark'));

  it('draws three completed marks for three sessions completed on the slot days', () => {
    render(
      <ComplianceGrid
        assignments={[
          assignment('2026-08-24', 'completed'), // Monday
          assignment('2026-08-26', 'completed'), // Wednesday
          assignment('2026-08-28', 'completed'), // Friday
        ]}
        weekStarts={[MONDAY]}
        slotWeekdays={[...MWF]}
        today="2026-09-04"
        weeklySessionTarget={TARGET}
      />,
    );
    expect(marksOf()).toEqual(['completed', 'completed', 'completed']);
    for (const cell of screen.getAllByRole('gridcell')) {
      expect(cell.querySelector('svg.status-mark')?.getAttribute('data-shape')).toBe('chip-check');
    }
    expect(screen.getByRole('rowheader').getAttribute('aria-label')).toBe(FORMAT.complianceWeek(MONDAY, 3, TARGET));
  });

  it('draws the screenshot only for sessions off the slot days, as the fixture has them', () => {
    render(
      <ComplianceGrid
        assignments={[
          assignment('2026-08-25', 'completed'), // Tuesday
          assignment('2026-08-28', 'completed'), // Friday
          assignment('2026-08-30', 'completed'), // Sunday
        ]}
        weekStarts={[MONDAY]}
        slotWeekdays={[...MWF]}
        today="2026-09-04"
        weeklySessionTarget={TARGET}
      />,
    );
    expect(marksOf()).toEqual(['none', 'none', 'completed']);
    expect(screen.getByRole('rowheader').getAttribute('aria-label')).toBe(FORMAT.complianceWeek(MONDAY, 3, TARGET));
  });
});
