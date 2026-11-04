// src/ui/views/train/useRoundClock.ts
//
// One round's countdown (P6). The deadline is the earlier of the round clock and the rest's end,
// read from the CURRENT timer each render, so a round can never outlive the rest it is in. The
// interval only forces a re-render; the value is recomputed from Date.now() (the RestTimerPanel
// rule, code review A31), and visibilitychange recomputes at once after a backgrounded spell.
//
// Units: instants [ms] epoch UTC; durations [s].
import { useEffect, useState } from 'react';
import type { RestTimer } from '../../../domain/training/restTimer';

const TICK_MS = 1000; // [ms]
const MS_PER_S = 1000; // [ms/s]
const S_PER_MIN = 60; // [s/min]

export interface RoundClock {
  remainingS: number; // [s] >= 0, rounded up
  minutes: number; // [min]
  seconds: number; // [s] 0-59
}

export function useRoundClock(timer: RestTimer, roundS: number): RoundClock {
  const [openedAt] = useState<number>(() => Date.now()); // [ms] epoch UTC
  const [now, setNow] = useState<number>(() => Date.now()); // [ms] epoch UTC

  useEffect(() => {
    const tick = (): void => {
      setNow(Date.now()); // [ms] epoch UTC
    };
    const id = window.setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const endsAt = Math.min(openedAt + roundS * MS_PER_S, timer.endsAt); // [ms] epoch UTC
  const remainingS = Math.max(0, Math.ceil((endsAt - now) / MS_PER_S)); // [s]
  return {
    remainingS,
    minutes: Math.floor(remainingS / S_PER_MIN), // [min]
    seconds: remainingS % S_PER_MIN, // [s]
  };
}
