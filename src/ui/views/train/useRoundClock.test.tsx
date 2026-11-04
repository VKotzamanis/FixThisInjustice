import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { RestTimer } from '../../../domain/training/restTimer';
import { useRoundClock } from './useRoundClock';

const NOW = Date.UTC(2026, 8, 11, 12, 0, 0); // [ms] epoch UTC

function timerEndingIn(seconds: number): RestTimer {
  return { startedAt: NOW, endsAt: NOW + seconds * 1000, durationS: seconds }; // [ms], [ms], [s]
}

function Probe({ timer, roundS }: { timer: RestTimer; roundS: number }): ReactElement {
  const clock = useRoundClock(timer, roundS);
  return <span data-testid="left">{clock.remainingS}</span>;
}

describe('useRoundClock (P6)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts the round down from its own clock while the rest is longer', () => {
    render(<Probe timer={timerEndingIn(120)} roundS={45} />);
    expect(screen.getByTestId('left').textContent).toBe('45');
    act(() => {
      vi.advanceTimersByTime(10_000); // [ms]
    });
    expect(screen.getByTestId('left').textContent).toBe('35');
  });

  it('never outlasts the rest, and stops at zero', () => {
    render(<Probe timer={timerEndingIn(20)} roundS={45} />);
    expect(screen.getByTestId('left').textContent).toBe('20');
    act(() => {
      vi.advanceTimersByTime(25_000); // [ms]
    });
    expect(screen.getByTestId('left').textContent).toBe('0');
  });

  it('recomputes at once when the page becomes visible again', () => {
    render(<Probe timer={timerEndingIn(120)} roundS={45} />);
    vi.setSystemTime(NOW + 30_000); // [ms] no interval tick has run
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByTestId('left').textContent).toBe('15');
  });
});
