// The brat headings (stylize survey 2026-10-18, item 1), checked across the views at once.
//
// Every `.view h2` and the Today `.hero-name` takes the display cut (`.ll-display`), EXCEPT a
// heading whose text carries a numeral, which tokens.css bars from the offset shadow. The test
// walks the headings each view actually renders rather than a list typed here, so a heading
// added later is covered without editing this file. Atlas is left to its own builder.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { DAY_MS, MONDAY, NOW_MS, seedState } from '../../test/scheduleFixtures';
import { ToastProvider } from '../components/ToastQueue';
import { DISPLAY_CLASS } from '../format/display';
import { LogView } from './LogView';
import { PlanView } from './PlanView';
import { SettingsView } from './SettingsView';
import { TargetsView } from './TargetsView';
import { TodayView } from './TodayView';
import { TrainView } from './TrainView';

const NUMERAL = /\p{N}/u;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  const state = seedState({
    labels: ['Push', 'Legs', 'Pull'],
    weekdays: [1, 3, 5], // ISO weekdays, Monday-first
    weeklySessionTarget: 3, // [sessions/week]
    startedOn: MONDAY,
  });
  useAppStore.setState({ ...state, ui: { ...state.ui, skin: 'limelight' } });
  installFakeStorage();
});

/** Every heading the brief covers, with its text and whether it took the display cut. */
function headingsOf(view: ReactElement): { text: string; display: boolean }[] {
  const { container, unmount } = render(view);
  const nodes = [...container.querySelectorAll('.view h2, .view .hero-name')];
  const out = nodes.map((node) => ({
    text: node.textContent,
    display: node.classList.contains(DISPLAY_CLASS),
  }));
  unmount();
  return out;
}

const VIEWS: readonly [string, () => ReactElement][] = [
  ['Today', () => <TodayView />],
  ['Plan', () => <PlanView />],
  ['Targets', () => <TargetsView />],
  [
    'Train',
    () => (
      <ToastProvider>
        <TrainView />
      </ToastProvider>
    ),
  ],
  ['Log', () => <LogView />],
  ['Settings (with Export)', () => <SettingsView />],
];

describe('brat headings', () => {
  it.each(VIEWS)('%s: display cut on every heading without a numeral, none on one with', (_, view) => {
    const headings = headingsOf(view());
    expect(headings.length).toBeGreaterThan(0);
    for (const h of headings) {
      expect({ text: h.text, display: h.display }).toEqual({
        text: h.text,
        display: !NUMERAL.test(h.text),
      });
    }
  });

  it('meets both branches on Today: a worded hero takes it, the strip heading with 14 does not', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS + DAY_MS); // Tuesday: a rest day, worded hero
    const headings = headingsOf(<TodayView />);
    expect(headings.some((h) => NUMERAL.test(h.text) && !h.display)).toBe(true);
    expect(headings.some((h) => h.display)).toBe(true);
  });
});
