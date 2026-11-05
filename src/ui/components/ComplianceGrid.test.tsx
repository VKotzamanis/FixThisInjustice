// src/ui/components/ComplianceGrid.test.tsx
//
// The grid draws what src/domain/schedule/compliance.ts decided (D06); every rule about WHICH
// mark a day gets is tested there. This suite covers the drawing: seven cells per week, the
// shared StatusMark per state, an empty cell outside the programme, and the row's two counts.
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FORMAT, copyFor } from '../../content/copy';
import type { ComplianceWeek, DayMark } from '../../domain/schedule/compliance';
import { useAppStore } from '../../store';
import { emptyState } from '../../test/scheduleFixtures';
import { ComplianceGrid } from './ComplianceGrid';

const MONDAY = '2026-09-07';
const DATES = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];

function week(marks: DayMark[], completed: number, target: number): ComplianceWeek {
  return { monday: MONDAY, completed, target, days: DATES.map((date, i) => ({ date, mark: marks[i] ?? 'none' })) };
}

beforeEach(() => {
  useAppStore.setState(emptyState());
});

describe('ComplianceGrid (D06)', () => {
  it('draws seven cells a week, Monday to Sunday, each carrying its mark and date', () => {
    const marks: DayMark[] = ['missed', 'completed', 'planned', 'none', 'postponed', 'paused', 'in-progress'];
    render(<ComplianceGrid weeks={[week(marks, 1, 3)]} />);
    const cells = screen.getAllByRole('gridcell');
    expect(cells.map((c) => c.getAttribute('data-mark'))).toEqual(marks);
    expect(cells.map((c) => c.getAttribute('data-date'))).toEqual(DATES);
    expect(cells[0]?.getAttribute('aria-label')).toBe(
      FORMAT.complianceCell(MONDAY, copyFor('limelight', 'status.markMissed')),
    );
    expect(cells[4]?.getAttribute('aria-label')).toBe(
      FORMAT.complianceCell('2026-09-11', copyFor('limelight', 'status.markPostponed')),
    );
  });

  it('draws the shared status mark for every state but blank, which stays empty', () => {
    const marks: DayMark[] = ['blank', 'blank', 'completed', 'skipped', 'missed', 'planned', 'none'];
    const { container } = render(<ComplianceGrid weeks={[week(marks, 1, 2)]} />);
    const cells = Array.from(container.querySelectorAll('[role="gridcell"]'));
    expect(cells[0]?.querySelector('svg')).toBeNull();
    expect(cells[0]?.getAttribute('aria-label')).toBe(
      FORMAT.complianceCell(MONDAY, copyFor('limelight', 'status.markOutsideProgramme')),
    );
    for (const [i, kind] of [[2, 'completed'], [3, 'skipped'], [4, 'missed'], [5, 'planned'], [6, 'none']] as const) {
      expect(cells[i]?.querySelector('svg')?.getAttribute('data-mark')).toBe(kind);
    }
  });

  it("states each week's completed count against its own target", () => {
    render(<ComplianceGrid weeks={[week([], 1, 2)]} />);
    const header = screen.getByRole('rowheader');
    expect(header.textContent).toBe(FORMAT.complianceWeekShort(MONDAY, 1, 2));
    expect(header.getAttribute('aria-label')).toBe(FORMAT.complianceWeek(MONDAY, 1, 2));
  });

  it('renders nothing but a message when there are no weeks yet', () => {
    render(<ComplianceGrid weeks={[]} />);
    expect(screen.getByText(copyFor('limelight', 'advice.noWeeksYet'))).toBeTruthy();
    expect(screen.queryByRole('grid')).toBeNull();
  });
});
