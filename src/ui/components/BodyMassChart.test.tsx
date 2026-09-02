// Body-mass chart: measured series against the projection the nutrition engine expects.
//
// Deviations from the P7 plan's Task 4 Step 6 literal (recorded here; the plan is not edited):
//  - `expectedRateKgPerWeek` is `number | null`, which is what NutritionTargets declares. The
//    plan's draft typed it `number` and would have printed a projection the engine refused to
//    give; the null case gets its own test below.
//  - The `// @vitest-environment jsdom` pragma is dropped: vitest.config.ts already sets jsdom
//    for the whole suite.
//  - Assertions quote src/content/copy.ts and src/domain/units.ts rather than literals, per the
//    copy contract ("test assertions quote the default table").

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { FORMAT } from '../../content/copy';
import { formatMass } from '../../domain/units';
import type { BodyMassEntry } from '../../domain/types';
import { BodyMassChart } from './BodyMassChart';

function entry(date: string, massKg: number, id: string): BodyMassEntry {
  return {
    id,
    profileId: 'p1',
    date,
    massKg, // [kg]
    enteredUnit: 'metric',
    bodyFatPct: null, // [%]
    loggedAt: Date.UTC(2026, 0, 5, 7, 0), // [ms] epoch, UTC
  };
}

/**
 * A six-month projection losing 0.5 kg per week from a 95.3 kg baseline.
 * `today` sits exactly at the 168-day horizon's end (2026-06-22), so it clamps nothing here —
 * these fixture-wide values exist to keep every test below unchanged by the projection clamp.
 */
const BASE = {
  baselineKg: 95.3, // [kg]
  baselineDate: '2026-01-05',
  expectedRateKgPerWeek: -0.5, // [kg/week] signed; negative is loss
  horizonDays: 168, // [d]
  today: '2026-06-22',
};

function labels(container: HTMLElement, testId: string): string[] {
  return [...container.querySelectorAll(`[data-testid='${testId}']`)].map((n) => n.textContent ?? '');
}

describe('BodyMassChart', () => {
  it('draws a projection even with no measurements', () => {
    const { container } = render(<BodyMassChart entries={[]} units="metric" {...BASE} />);
    const proj = container.querySelector("[data-testid='projection']");
    expect(proj?.getAttribute('d')).toMatch(/^M -?[\d.]+ -?[\d.]+ L -?[\d.]+ -?[\d.]+$/);
    expect(container.querySelectorAll("[data-testid='measured-point']")).toHaveLength(0);
  });

  it('draws no projection when the engine gives no expected rate', () => {
    // NutritionTargets.expectedRateKgPerWeek is null outside the engine's domain. A line drawn
    // at an assumed rate would be a number the app invented.
    const { container } = render(
      <BodyMassChart
        entries={[entry('2026-01-05', 95.3, 'a')]}
        units="metric"
        {...BASE}
        expectedRateKgPerWeek={null}
      />,
    );
    expect(container.querySelector("[data-testid='projection']")).toBeNull();
    expect(container.querySelectorAll("[data-testid='measured-point']")).toHaveLength(1);
  });

  it('plots one point per measurement', () => {
    const { container } = render(
      <BodyMassChart
        entries={[entry('2026-01-05', 95.3, 'a'), entry('2026-01-19', 93.1, 'b')]}
        units="metric"
        {...BASE}
      />,
    );
    expect(container.querySelectorAll("[data-testid='measured-point']")).toHaveLength(2);
  });

  it('never emits NaN or Infinity into an SVG attribute', () => {
    const { container } = render(
      <BodyMassChart
        entries={[entry('2026-01-05', 95.3, 'a'), entry('2026-01-05', 95.3, 'b')]}
        units="metric"
        {...BASE}
        expectedRateKgPerWeek={0}
      />,
    );
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('widens a degenerate domain instead of dividing by zero', () => {
    const { container } = render(
      <BodyMassChart
        entries={[entry('2026-01-05', 80, 'a')]}
        units="metric"
        baselineKg={80} // [kg]
        baselineDate="2026-01-05"
        expectedRateKgPerWeek={0} // [kg/week]
        horizonDays={28} // [d]
        today="2026-02-02" // the 28-day horizon's end: the clamp is a no-op for this test
      />,
    );
    const ticks = labels(container, 'y-label');
    expect(ticks.length).toBeGreaterThan(1);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("labels the mass axis in the profile's display unit", () => {
    const { container } = render(
      <BodyMassChart entries={[entry('2026-01-05', 95.3, 'a')]} units="imperial" {...BASE} />,
    );
    expect(labels(container, 'y-label').every((l) => l.endsWith(' lb'))).toBe(true);
  });

  it('labels the date axis with the span it draws', () => {
    const { container } = render(
      <BodyMassChart entries={[entry('2026-01-05', 95.3, 'a')]} units="metric" {...BASE} />,
    );
    // Baseline day, and the last day the 168-day horizon reaches.
    expect(labels(container, 'x-label')).toEqual(['2026-01-05', '2026-06-22']);
  });

  it('extends the domain to cover a measurement taken before the baseline', () => {
    const { container } = render(
      <BodyMassChart entries={[entry('2025-12-01', 99, 'a')]} units="metric" {...BASE} />,
    );
    const point = container.querySelector("[data-testid='measured-point']");
    expect(Number(point?.getAttribute('cx'))).toBeGreaterThanOrEqual(0);
    expect(labels(container, 'x-label')[0]).toBe('2025-12-01');
  });

  it('names itself with the range of both axes and the last measurement', () => {
    const { container } = render(
      <BodyMassChart
        entries={[entry('2026-01-05', 95.3, 'a'), entry('2026-01-19', 93.1, 'b')]}
        units="metric"
        {...BASE}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    const ticks = labels(container, 'y-label');
    const low = ticks[0];
    const high = ticks[ticks.length - 1];
    expect(low).toBeDefined();
    expect(high).toBeDefined();
    expect(svg?.getAttribute('aria-label')).toBe(
      FORMAT.bodyMassChartLabel(
        '2026-01-05',
        '2026-06-22',
        low ?? '',
        high ?? '',
        formatMass(93.1, 'metric'),
        '2026-01-19',
      ),
    );
  });

  it('names itself without a last value when nothing is measured', () => {
    const { container } = render(<BodyMassChart entries={[]} units="metric" {...BASE} />);
    const ticks = labels(container, 'y-label');
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe(
      FORMAT.bodyMassChartEmptyLabel(
        '2026-01-05',
        '2026-06-22',
        ticks[0] ?? '',
        ticks[ticks.length - 1] ?? '',
      ),
    );
  });

  it('clamps the projection to today, not the far end of a long horizonDays', () => {
    // horizonDays: 168 (~24 weeks) is the plan's own example; today sits only 30 days after the
    // baseline. The dashed projection must stop at today even though the horizontal domain (the
    // date axis) still spans the full 168-day horizon.
    const today = '2026-02-04'; // [date] baseline (2026-01-05) + 30 d
    const { container } = render(
      <BodyMassChart
        entries={[entry('2026-02-04', 94, 'a')]} // sits exactly at today: a reference x-coordinate
        units="metric"
        {...BASE}
        today={today}
      />,
    );
    const projD = container.querySelector("[data-testid='projection']")?.getAttribute('d') ?? '';
    const projEndX = projD.split(' ')[4]; // "M x1 y1 L x2 y2" -> x2
    const todayPointX = container
      .querySelector("[data-testid='measured-point']")
      ?.getAttribute('cx');
    expect(projEndX).toBe(todayPointX);
    // The axis itself is unaffected: it still spans the full 168-day horizon. Only the
    // projection line is clamped.
    expect(labels(container, 'x-label')).toEqual(['2026-01-05', '2026-06-22']);
  });

  it('still ends the projection at today when a weigh-in is dated after today', () => {
    // A future-dated weigh-in (baseline + 200 d: past both today and the 168-day horizon) widens
    // the domain per the "extends the domain" behaviour above. It must not drag the dashed
    // projection line out with it.
    const today = '2026-02-04'; // [date] baseline (2026-01-05) + 30 d
    const { container } = render(
      <BodyMassChart
        entries={[
          entry('2026-02-04', 94, 'today-point'), // baseline + 30 d
          entry('2026-07-24', 90, 'future-point'), // baseline + 200 d
        ]}
        units="metric"
        {...BASE}
        today={today}
      />,
    );
    const projD = container.querySelector("[data-testid='projection']")?.getAttribute('d') ?? '';
    const projEndX = projD.split(' ')[4];
    const points = [...container.querySelectorAll("[data-testid='measured-point']")];
    const todayPointX = points[0]?.getAttribute('cx'); // ascending date order: today-point is first
    expect(projEndX).toBe(todayPointX);
    // The domain DID extend to the future weigh-in (proof the widening still happens); the
    // projection still stopped at today rather than following it out.
    expect(labels(container, 'x-label')[1]).toBe('2026-07-24');
  });
});
