import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../../content/copy';
import { REST_GAME_FORMAT } from '../../../content/restGameFormat';
import { plateMathRound } from '../../../domain/fun/plateMath';
import type { RestTimer } from '../../../domain/training/restTimer';
import type { UnitSystem } from '../../../domain/types';
import { PlateMathGame } from './PlateMathGame';
import { DEFAULT_REST_GAME_HOST, RestGameHostContext } from './restGameHost';

const NOW = Date.UTC(2026, 8, 11, 12, 0, 0); // [ms] epoch UTC

const TIMER: RestTimer = {
  startedAt: NOW,
  endsAt: NOW + 120_000, // [ms]
  durationS: 120, // [s]
  game: {
    exerciseId: 'barbell-bench-press',
    sessionId: 'session-1',
    assignmentDate: '2026-09-11',
    setNumber: 1,
    sessionSetOrdinal: 1,
  },
};

function renderGame(units: UnitSystem = 'metric') {
  const onExit = vi.fn();
  const onWin = vi.fn();
  const view = render(
    <RestGameHostContext value={{ ...DEFAULT_REST_GAME_HOST, units }}>
      <PlateMathGame
        timer={TIMER}
        priorWins={0}
        soundsEnabled={false}
        t={copy}
        overrides={{}}
        onExit={onExit}
        onWin={onWin}
      />
    </RestGameHostContext>,
  );
  return { ...view, onExit, onWin };
}

const unitOf = (units: UnitSystem): string => (units === 'metric' ? 'kg' : 'lb');

/** One side's plates, greedy: exact here because the smallest plate divides every target step. */
function sidePlates(target: number, bar: number, plates: readonly number[]): number[] {
  let left = Math.round(((target - bar) / 2) * 100); // [hundredths] one side
  const side: number[] = [];
  for (const plate of plates) {
    const step = Math.round(plate * 100); // [hundredths]
    while (left >= step) {
      side.push(plate);
      left -= step;
    }
  }
  if (left !== 0) throw new Error(`no exact side for ${String(target)}`);
  return side;
}

function loadTarget(index: number, units: UnitSystem): void {
  const round = plateMathRound(TIMER.game!, TIMER.durationS, 0, units);
  const target = round.targets[index] ?? Number.NaN;
  for (const plate of sidePlates(target, round.bar, round.plates)) {
    fireEvent.click(screen.getByRole('button', { name: `${String(plate)} ${unitOf(units)}` }));
  }
}

/** The value printed under a readout label (`<dt>` then `<dd>`). */
function readout(key: 'label.restGamePlateTarget' | 'label.restGamePlateOnBar'): string {
  return screen.getByText(copy(key)).nextElementSibling?.textContent ?? '';
}

describe('PlateMathGame (P6)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads three targets in kilograms and records one win without touching the timer', () => {
    const { onWin } = renderGame('metric');
    const round = plateMathRound(TIMER.game!, TIMER.durationS, 0, 'metric');
    for (let i = 0; i < round.targets.length; i += 1) {
      expect(readout('label.restGamePlateTarget')).toBe(`${String(round.targets[i])} kg`);
      loadTarget(i, 'metric');
    }
    expect(screen.getByText(copy('status.restWordWon'))).toBeInTheDocument();
    expect(onWin).toHaveBeenCalledTimes(1);
    expect(TIMER.endsAt).toBe(NOW + 120_000); // [ms]
  });

  it('uses pounds, a 45 lb bar and pound plates for an imperial profile', () => {
    renderGame('imperial');
    expect(screen.getByRole('button', { name: '45 lb' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1.25 kg' })).toBeNull();
    expect(readout('label.restGamePlateOnBar')).toBe('45 lb');
    for (let i = 0; i < 3; i += 1) loadTarget(i, 'imperial');
    expect(screen.getByText(copy('status.restWordWon'))).toBeInTheDocument();
  });

  it('takes the last plate off with Remove Plate', () => {
    renderGame('metric');
    // 20 + 2 x 1.25 = 22.5 kg, under the smallest possible target (20 + 2 x 2 x 1.25 = 25 kg).
    fireEvent.click(screen.getByRole('button', { name: '1.25 kg' }));
    expect(readout('label.restGamePlateOnBar')).toBe('22.5 kg');
    fireEvent.click(screen.getByRole('button', { name: copy('button.restGamePlateRemove') }));
    expect(readout('label.restGamePlateOnBar')).toBe('20 kg');
  });

  it('says by how much the bar is over the target, in the profile unit (lead ruling R-G2)', () => {
    renderGame('metric');
    const round = plateMathRound(TIMER.game!, TIMER.durationS, 0, 'metric');
    const target = round.targets[0] ?? Number.NaN; // [kg] whole bar
    // 25 kg plates until the bar is over; none of the loads on the way may hit the target.
    let onBar = round.bar; // [kg]
    while (onBar <= target) {
      expect(onBar).not.toBe(target);
      fireEvent.click(screen.getByRole('button', { name: '25 kg' }));
      onBar += 2 * 25; // [kg] one plate on each side
    }
    expect(screen.queryByText(/^Over by/)).not.toBeNull();
    expect(screen.getByText(REST_GAME_FORMAT.plateOver(`${String(onBar - target)} kg`))).toBeInTheDocument();
  });

  it('shows no overshoot line at or under the target', () => {
    renderGame('metric');
    fireEvent.click(screen.getByRole('button', { name: '1.25 kg' }));
    expect(screen.queryByText(/^Over by/)).toBeNull();
  });

  it('takes a loaded plate off when it is tapped, whichever it is (lead ruling R-G2)', () => {
    renderGame('metric');
    const round = plateMathRound(TIMER.game!, TIMER.durationS, 0, 'metric');
    const target = round.targets[0] ?? Number.NaN; // [kg] whole bar
    // 1.25 kg first (22.5 kg is under every target), then a plate whose loads miss the target.
    const second = round.plates.find(
      (plate) => round.bar + 2 * (1.25 + plate) !== target && round.bar + 2 * plate !== target,
    );
    if (second === undefined) throw new Error('no second plate that keeps the target unsolved');
    fireEvent.click(screen.getByRole('button', { name: '1.25 kg' }));
    fireEvent.click(screen.getByRole('button', { name: `${String(second)} kg` }));
    // The FIRST plate, not the last: tapping a chip removes that chip.
    fireEvent.click(screen.getByRole('button', { name: REST_GAME_FORMAT.plateTakeOff('1.25 kg') }));
    expect(readout('label.restGamePlateOnBar')).toBe(`${String(round.bar + 2 * second)} kg`);
    expect(screen.queryByRole('button', { name: REST_GAME_FORMAT.plateTakeOff('1.25 kg') })).toBeNull();
    expect(screen.getByRole('button', { name: REST_GAME_FORMAT.plateTakeOff(`${String(second)} kg`) })).toBeInTheDocument();
  });

  it('counts the targets done', () => {
    renderGame('metric');
    expect(screen.getByText(REST_GAME_FORMAT.progress(0, 3))).toBeInTheDocument();
    loadTarget(0, 'metric');
    expect(screen.getByText(REST_GAME_FORMAT.progress(1, 3))).toBeInTheDocument();
  });

  it('ends out of time with the plates put away', () => {
    const { onWin } = renderGame('metric');
    act(() => {
      vi.advanceTimersByTime(60_000); // [ms] the 120 s rest's round is 60 s
    });
    expect(screen.getByText(copy('status.restGameTimeUp'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '25 kg' })).toBeNull();
    expect(onWin).not.toHaveBeenCalled();
  });
});
