// src/ui/planBrowse.test.tsx
//
// The week the Plan view is showing, as state the keyboard can move.
//
// Deviations from the P8 plan's Task 9 Step 5 draft, recorded here and in the task report:
//  - The browsed position is a WEEK, not a { blockIndex, sessionIndex } pair. PlanView renders
//    one week at a time and has no session cursor, so a session index would be state nothing
//    on screen could show: pressing the key would appear to do nothing two presses in three.
//    Block movement survives as a jump to the block's first week, which the block chips
//    already perform on a tap.
//  - Module state read through useSyncExternalStore, not a React context, exactly as the
//    shipped src/ui/planFocus.tsx is: the writer is the hotkey handler in the app shell and
//    the reader is the Plan view, and a context would need every PlanView test to mount a
//    provider to render a view that has no other need of one.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { defaultState, useAppStore } from '../store';
import { installFakeStorage } from '../store/testStorage';
import { MONDAY, NOW_MS, planOf, seedState } from '../test/scheduleFixtures';
import type { AppState, PlanBlock } from '../domain/types';
import {
  browseWeek,
  resetPlanBrowse,
  stepBrowseBlock,
  stepBrowseWeek,
  usePlanBrowseWeek,
  weekCountOf,
  weekOfIndex,
} from './planBrowse';

/** Six sessions at three a week: two weeks, one block each. */
const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];
const MWF = [1, 3, 5] as const;
const SPW = 3; // [sessions/week]

const BLOCKS: PlanBlock[] = [
  {
    index: 0,
    firstSessionIndex: 0, // [sessions] offset, week 0
    sessionCount: 3, // [sessions]
    setModifier: 1, // dimensionless
    loadModifier: 1, // dimensionless
    isDeload: false,
  },
  {
    index: 1,
    firstSessionIndex: 3, // [sessions] offset, week 1
    sessionCount: 3, // [sessions]
    setModifier: 0.5, // dimensionless
    loadModifier: 1, // dimensionless
    isDeload: true,
  },
];

function seed(nextSessionIndex = 0): AppState {
  return seedState({
    labels: LABELS,
    weekdays: [...MWF],
    weeklySessionTarget: SPW,
    sessionsPerWeek: SPW,
    startedOn: MONDAY,
    nextSessionIndex,
    blocks: BLOCKS,
  });
}

/** Renders the browsed week, or 'cursor' while nothing has been browsed. */
function Probe(): ReactElement {
  const week = usePlanBrowseWeek();
  return <span data-testid="week">{week === null ? 'cursor' : String(week)}</span>;
}

function shownWeek(): string {
  return screen.getByTestId('week').textContent ?? '';
}

beforeEach(() => {
  installFakeStorage();
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  useAppStore.setState(seed());
  // Module state: a week left browsed by one test would be the starting point of the next.
  resetPlanBrowse();
});

describe('weekOfIndex', () => {
  it('chunks a session position into 0-based weeks', () => {
    expect(weekOfIndex(0, 3)).toBe(0);
    expect(weekOfIndex(2, 3)).toBe(0);
    expect(weekOfIndex(3, 3)).toBe(1);
  });

  it('answers week 0 for a plan that claims no weekly rate, rather than dividing by zero', () => {
    expect(weekOfIndex(5, 0)).toBe(0);
  });
});

describe('weekCountOf', () => {
  it('counts the weeks the sessions actually fill, not the weeks the plan claims', () => {
    // The fixture plan holds 6 sessions at 3 a week, and PlanTemplate.weeks says 2.
    expect(weekCountOf(planOf(seed()))).toBe(2); // [weeks]
  });

  it('is one week for no plan at all', () => {
    expect(weekCountOf(null)).toBe(1); // [weeks]
  });
});

describe('the browsed week', () => {
  it('follows the cursor until something browses', () => {
    render(<Probe />);
    expect(shownWeek()).toBe('cursor');
  });

  it('takes an absolute week and publishes it', () => {
    render(<Probe />);
    act(() => {
      browseWeek(1);
    });
    expect(shownWeek()).toBe('1');
  });

  it('clamps an absolute week to the weeks the plan holds', () => {
    render(<Probe />);
    act(() => {
      browseWeek(9);
    });
    expect(shownWeek()).toBe('1');
    act(() => {
      browseWeek(-4);
    });
    expect(shownWeek()).toBe('0');
  });

  it('steps forward from the cursor week and stops at the last week', () => {
    render(<Probe />);
    act(() => {
      stepBrowseWeek(1);
    });
    expect(shownWeek()).toBe('1');
    act(() => {
      stepBrowseWeek(1);
    });
    expect(shownWeek()).toBe('1');
  });

  it('steps back and stops at the first week', () => {
    useAppStore.setState(seed(4)); // cursor in week 1
    render(<Probe />);
    act(() => {
      stepBrowseWeek(-1);
    });
    expect(shownWeek()).toBe('0');
    act(() => {
      stepBrowseWeek(-1);
    });
    expect(shownWeek()).toBe('0');
  });

  it("jumps to the next block's first week, and no further than the last block", () => {
    render(<Probe />);
    act(() => {
      stepBrowseBlock(1);
    });
    expect(shownWeek()).toBe('1');
    act(() => {
      stepBrowseBlock(1);
    });
    expect(shownWeek()).toBe('1');
  });

  it("jumps back to the previous block's first week", () => {
    render(<Probe />);
    act(() => {
      browseWeek(1);
      stepBrowseBlock(-1);
    });
    expect(shownWeek()).toBe('0');
  });

  it('goes back to following the cursor when it is reset', () => {
    render(<Probe />);
    act(() => {
      browseWeek(1);
    });
    expect(shownWeek()).toBe('1');
    act(() => {
      resetPlanBrowse();
    });
    expect(shownWeek()).toBe('cursor');
  });

  it('moves nowhere, and throws nothing, with no plan to browse', () => {
    useAppStore.setState(defaultState());
    render(<Probe />);
    act(() => {
      stepBrowseWeek(1);
      stepBrowseBlock(1);
    });
    expect(shownWeek()).toBe('0');
  });
});
