// src/ui/components/Spotlight.test.tsx
//
// The palette and the plan deep link it produces.
//
// The legacy palette (legacy/console-shared.jsx:147-224) built a CSS ATTRIBUTE SELECTOR for the
// target row inside a setTimeout and hoped the Plan view had rendered by the time it fired.
// Both halves of that are asserted away here: the id comes from one exported function
// (src/ui/format/plan.ts planRowDomId), and the focus is delivered by an effect in PlanView, so
// the deep-link test below can assert document.activeElement rather than a timer.
//
// Deviations from the P8 plan's literal draft, recorded here and in the task report:
//
//  1. The draft's view registry lists eight views (protocols, atlas, export). The shipped
//     src/app/App.tsx has six, and this task may not edit App.tsx, so the registry and these
//     assertions follow the shipped union. VIEWS is quoted rather than counted by hand.
//  2. The draft renders a `role="searchbox"` input and `data-testid` rows. The combobox /
//     listbox / option structure asserted here is the task's own requirement and is what a
//     screen reader needs to announce "3 of 8" while the arrow keys move the selection.
//  3. The draft caps the list at 12 and matches over `label + hint`. This caps at 8 and matches
//     over the LABEL only, which is the view name or the exercise name.
//  4. No `session` or `settings` result kind: Settings is a view in the shipped NAV, and the
//     task scopes results to views plus plan rows.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FORMAT, copy, copyFor } from '../../content/copy';
import type { AppState, PlanTemplate } from '../../domain/types';
import { useAppStore } from '../../store';
import { MONDAY, NOW_MS, seedState } from '../../test/scheduleFixtures';
import { exerciseName, planRowDomId } from '../format/plan';
import { VIEWS } from '../nav/views';
import { requestPlanFocus } from '../planFocus';
import { PlanView } from '../views/PlanView';
import {
  MAX_SPOTLIGHT_RESULTS,
  Spotlight,
  buildSpotlightItems,
  filterSpotlightItems,
} from './Spotlight';
import type { SkinId } from '../../domain/types';

const LABELS = ['Push', 'Legs', 'Pull', 'Push', 'Legs', 'Pull'];
/** Monday, Wednesday, Friday: ISO weekdays, Monday-first. */
const MWF = [1, 3, 5] as const;
/** [sessions/week] Six sessions at three a week: two weeks, and the Plan view shows week 1. */
const SPW = 3;
const WEEKS = 2; // [weeks]
/** Two planned exercises per session in the fixture, so six sessions carry twelve. */
const EXERCISES_PER_SESSION = 2;

function seed(): AppState {
  return seedState({
    labels: LABELS,
    weekdays: [...MWF],
    weeklySessionTarget: SPW,
    sessionsPerWeek: SPW,
    startedOn: MONDAY,
    nextSessionIndex: 0,
  });
}

function planOfState(state: AppState): PlanTemplate {
  const plan = Object.values(state.plans)[0];
  if (plan === undefined) throw new Error('fixture: plan missing');
  return plan;
}

/** No-op collaborators, so a test overrides only the one it is asserting on. */
function args(over: Partial<Parameters<typeof buildSpotlightItems>[0]> = {}): Parameters<
  typeof buildSpotlightItems
>[0] {
  return {
    plan: planOfState(seed()),
    setView: () => {
      /* asserted by the tests that pass a spy */
    },
    focusPlanRow: () => {
      /* asserted by the tests that pass a spy */
    },
    close: () => {
      /* asserted by the tests that pass a spy */
    },
    ...over,
  };
}

/**
 * The shell the palette actually lives in: a view switch driven by `ui.lastView`, and the
 * palette beside it. It is here rather than in App.tsx because P8 Task 9 owns that wiring; the
 * deep link is nonetheless only meaningful against a tree where selecting a result MOUNTS the
 * Plan view, which is exactly what this reproduces.
 */
function Harness(): ReactElement {
  const [open, setOpen] = useState(true);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  const view = useAppStore((s) => s.ui.lastView);
  return (
    <>
      {view === 'plan' ? <PlanView /> : null}
      <Spotlight open={open} onClose={close} />
    </>
  );
}

function renderPalette(onClose = (): void => {}): ReturnType<typeof render> {
  return render(<Spotlight open onClose={onClose} />);
}

function queryBox(): HTMLElement {
  return screen.getByRole('combobox');
}

function optionLabels(): (string | null)[] {
  return screen.getAllByRole('option').map((o) => o.getAttribute('data-label'));
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS); // [ms] epoch, UTC
  useAppStore.setState(seed());
  // Module state: a target left pending by one test would be consumed by the next one.
  requestPlanFocus(null);
});

afterEach(() => {
  requestPlanFocus(null);
  vi.restoreAllMocks();
});

/*
 * The app ships with `ui.skin: 'limelight'` (src/domain/schema.ts), so a component that reads
 * the table through `useCopy()` renders the limelight words unless a test says otherwise. The
 * assertions in this file quote the DEFAULT table, so the skin is pinned to clinical before
 * each of them; what a skin changes has its own test.
 *
 * A seed that REPLACES `ui` (makeAppState, defaultState, wipeAll) puts the shipped skin back,
 * so it is a named function rather than an inline hook body: a test that reseeds calls it
 * again, after the seed.
 */
function pinSkin(skin: SkinId = 'clinical'): void {
  useAppStore.setState((s) => ({ ui: { ...s.ui, skin } }));
}

beforeEach(() => {
  pinSkin();
});

describe('buildSpotlightItems', () => {
  it('lists every view, then every planned exercise', () => {
    const items = buildSpotlightItems(args());
    expect(items.filter((i) => i.kind === 'view')).toHaveLength(VIEWS.length);
    expect(items.filter((i) => i.kind === 'exercise')).toHaveLength(
      LABELS.length * EXERCISES_PER_SESSION,
    );
    // Views first: with an empty query the palette is a view switcher, not an exercise list.
    expect(items.slice(0, VIEWS.length).every((i) => i.kind === 'view')).toBe(true);
  });

  it('labels views from the registry', () => {
    const items = buildSpotlightItems(args());
    expect(items.slice(0, VIEWS.length).map((i) => i.label)).toEqual(VIEWS.map((v) => v.label));
  });

  it('names exercises through the library, falling back to the id', () => {
    // The fixture's ids ("ex-1") are deliberately not in the library, so this row exercises
    // exerciseName's documented fallback rather than asserting a name the library may reword.
    const items = buildSpotlightItems(args());
    const first = items.find((i) => i.kind === 'exercise');
    expect(first?.label).toBe('ex-1');
    expect(first?.label).toBe(exerciseName('ex-1'));
  });

  it('sends an exercise result to the Plan view with its row requested', () => {
    const setView = vi.fn();
    const focusPlanRow = vi.fn();
    const close = vi.fn();
    const items = buildSpotlightItems(args({ setView, focusPlanRow, close }));

    items.find((i) => i.kind === 'exercise')?.run();

    expect(setView).toHaveBeenCalledWith('plan');
    // s-1 is the first session in the fixture and ex-1 its first planned exercise.
    expect(focusPlanRow).toHaveBeenCalledWith({ sessionId: 's-1', exerciseId: 'ex-1' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('sends a view result to that view and requests no row focus', () => {
    const setView = vi.fn();
    const focusPlanRow = vi.fn();
    const close = vi.fn();
    const items = buildSpotlightItems(args({ setView, focusPlanRow, close }));

    items.find((i) => i.kind === 'view' && i.label === copy('nav.targets'))?.run();

    expect(setView).toHaveBeenCalledWith('targets');
    expect(focusPlanRow).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('still lists the views when there is no plan', () => {
    const items = buildSpotlightItems(args({ plan: null }));
    expect(items).toHaveLength(VIEWS.length);
  });

  it('gives every item a unique key', () => {
    // The keys become DOM ids for aria-activedescendant, so a duplicate would point the
    // combobox at the wrong row.
    const keys = buildSpotlightItems(args()).map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('filterSpotlightItems', () => {
  it('matches a case-insensitive substring of the label', () => {
    const items = buildSpotlightItems(args());
    expect(filterSpotlightItems(items, 'ARGET').map((i) => i.label)).toEqual([copy('nav.targets')]);
    expect(filterSpotlightItems(items, 'ex-3').map((i) => i.label)).toEqual(['ex-3']);
  });

  it('does not match on the hint, only on the label', () => {
    // The hint names the session a row sits in. Matching it would make "Push" return six
    // exercises whose own names contain nothing of the sort.
    const items = buildSpotlightItems(args());
    expect(filterSpotlightItems(items, 'Push')).toHaveLength(0);
  });

  it('caps the result list', () => {
    const items = buildSpotlightItems(args());
    expect(items.length).toBeGreaterThan(MAX_SPOTLIGHT_RESULTS);
    expect(filterSpotlightItems(items, '')).toHaveLength(MAX_SPOTLIGHT_RESULTS);
    expect(filterSpotlightItems(items, 'ex-')).toHaveLength(MAX_SPOTLIGHT_RESULTS);
  });

  it('ignores surrounding whitespace', () => {
    const items = buildSpotlightItems(args());
    expect(filterSpotlightItems(items, '  ex-3  ').map((i) => i.label)).toEqual(['ex-3']);
  });
});

describe('Spotlight', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Spotlight open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('is a modal dialog whose combobox owns the result listbox', () => {
    renderPalette();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const box = queryBox();
    expect(box.getAttribute('aria-expanded')).toBe('true');
    const listbox = screen.getByRole('listbox');
    expect(box.getAttribute('aria-controls')).toBe(listbox.id);
    expect(listbox.id).not.toBe('');
  });

  it('puts the caret in the query box on open', () => {
    renderPalette();
    expect(document.activeElement).toBe(queryBox());
  });

  it('takes the caret when it OPENS, not only when it first mounts', () => {
    // The palette is a CONTROLLED component that stays mounted with `open` toggling (P8 Task 9
    // renders it beside the views), so a mount-only focus effect runs once, while `open` is
    // false and the input does not exist. The caret would then stay on ModalShell's panel.
    const { rerender } = render(<Spotlight open={false} onClose={() => {}} />);
    rerender(<Spotlight open onClose={() => {}} />);

    expect(document.activeElement).toBe(queryBox());
  });

  it('clears the query and the active row when it closes', () => {
    // State survives a close, because the component is not unmounted by it. Reopening on the
    // previous query would show the user a result set they did not ask for, and Enter would
    // run whatever row the last arrow press had left active.
    const { rerender } = render(<Spotlight open onClose={() => {}} />);
    fireEvent.change(queryBox(), { target: { value: 'ex-' } });
    fireEvent.keyDown(queryBox(), { key: 'ArrowDown' });
    expect(queryBox().getAttribute('aria-activedescendant')).toBe(
      screen.getAllByRole('option')[1]!.id,
    );

    rerender(<Spotlight open={false} onClose={() => {}} />);
    rerender(<Spotlight open onClose={() => {}} />);

    expect((queryBox() as HTMLInputElement).value).toBe('');
    // The unfiltered list is back, and the first row of it is the one Enter would run.
    expect(screen.getAllByRole('option')).toHaveLength(MAX_SPOTLIGHT_RESULTS);
    expect(optionLabels()[0]).toBe(VIEWS[0]!.label);
    expect(queryBox().getAttribute('aria-activedescendant')).toBe(
      screen.getAllByRole('option')[0]!.id,
    );
  });

  it('reports the listbox as collapsed when nothing matched', () => {
    // aria-expanded states whether the popup HAS anything in it. Left hard-coded true, a
    // screen reader announces an expanded listbox over a query that returned no rows.
    renderPalette();
    expect(queryBox().getAttribute('aria-expanded')).toBe('true');

    fireEvent.change(queryBox(), { target: { value: 'zzzzzz' } });
    expect(queryBox().getAttribute('aria-expanded')).toBe('false');
  });

  it('announces a dead query through a live region the combobox describes', () => {
    renderPalette();
    const status = screen.getByRole('status');
    // Mounted empty from the first render: a live region inserted at the same moment as its
    // text is not reliably announced, because the region was not there to be observed.
    expect(status.textContent).toBe('');
    expect(queryBox().getAttribute('aria-describedby')).toBe(status.id);
    expect(status.id).not.toBe('');

    fireEvent.change(queryBox(), { target: { value: 'zzzzzz' } });
    expect(screen.getByRole('status').textContent).toBe(copy('advice.noSpotlightMatch'));
  });

  it('caps the rendered results', () => {
    renderPalette();
    expect(screen.getAllByRole('option')).toHaveLength(MAX_SPOTLIGHT_RESULTS);
  });

  it('filters the list by the typed query', () => {
    renderPalette();
    fireEvent.change(queryBox(), { target: { value: 'targ' } });
    expect(optionLabels()).toEqual([copy('nav.targets')]);
  });

  it('reports an empty result set', () => {
    renderPalette();
    fireEvent.change(queryBox(), { target: { value: 'zzzzzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(copy('advice.noSpotlightMatch'))).toBeTruthy();
  });

  it('moves the active option with the arrow keys and reports it to the combobox', () => {
    renderPalette();
    const box = queryBox();
    const options = screen.getAllByRole('option');

    expect(box.getAttribute('aria-activedescendant')).toBe(options[0]!.id);
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box.getAttribute('aria-activedescendant')).toBe(options[1]!.id);
    expect(screen.getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByRole('option')[0]!.getAttribute('aria-selected')).toBe('false');

    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(box.getAttribute('aria-activedescendant')).toBe(options[0]!.id);
  });

  it('wraps the selection at both ends of the list', () => {
    renderPalette();
    const box = queryBox();
    const last = screen.getAllByRole('option').at(-1)!;

    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(box.getAttribute('aria-activedescendant')).toBe(last.id);

    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id);
  });

  it('returns the selection to the top when the query changes', () => {
    // Otherwise Enter runs whatever sat at that index in the PREVIOUS result set.
    renderPalette();
    const box = queryBox();
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.change(box, { target: { value: 'ex-' } });
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id);
  });

  it('runs the active result on Enter and closes', () => {
    const onClose = vi.fn();
    renderPalette(onClose);
    const box = queryBox();
    // Second view in the registry order, so this asserts the ACTIVE row runs and not the first.
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(useAppStore.getState().ui.lastView).toBe(VIEWS[1]!.id);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('runs a result that is clicked', () => {
    const onClose = vi.fn();
    renderPalette(onClose);
    fireEvent.change(queryBox(), { target: { value: 'targ' } });
    fireEvent.click(screen.getAllByRole('option')[0]!);

    expect(useAppStore.getState().ui.lastView).toBe('targets');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does nothing on Enter when nothing matched', () => {
    const onClose = vi.fn();
    renderPalette(onClose);
    fireEvent.change(queryBox(), { target: { value: 'zzzzzz' } });
    fireEvent.keyDown(queryBox(), { key: 'Enter' });

    expect(useAppStore.getState().ui.lastView).toBe('today');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape, exactly once', () => {
    // Escape is ModalShell's, not the palette's. Handling it in both would call onClose twice,
    // which for a caller that toggles rather than clears is a dialog that will not stay shut.
    const onClose = vi.fn();
    renderPalette(onClose);
    fireEvent.keyDown(queryBox(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('plan deep link', () => {
  it('renders a row whose id matches planRowDomId for every exercise in the shown week', () => {
    const { container } = render(<PlanView />);
    const plan = planOfState(seed());
    // The Plan view shows one WEEK at a time, so only the cursor's week is asserted here.
    for (const session of plan.sessions.slice(0, SPW)) {
      for (const pe of session.exercises) {
        const id = planRowDomId(session.id, pe.exerciseId);
        expect(container.querySelector(`#${CSS.escape(id)}`), id).not.toBeNull();
      }
    }
  });

  it('switches to the Plan view and focuses the row the result names', () => {
    render(<Harness />);
    // ex-3 is the first planned exercise of session s-2, which sits in the cursor's week.
    fireEvent.change(queryBox(), { target: { value: 'ex-3' } });
    fireEvent.keyDown(queryBox(), { key: 'Enter' });

    expect(useAppStore.getState().ui.lastView).toBe('plan');
    expect(document.activeElement?.id).toBe(planRowDomId('s-2', 'ex-3'));
  });

  it('scrubs the Plan view to the target week when the row is outside the week shown', () => {
    render(<Harness />);
    // ex-7 is the first planned exercise of session s-4. Six sessions at three a week put it
    // in WEEK 2, and the Plan view opens on the cursor's week, which is week 1.
    fireEvent.change(queryBox(), { target: { value: 'ex-7' } });
    fireEvent.keyDown(queryBox(), { key: 'Enter' });

    expect(useAppStore.getState().ui.lastView).toBe('plan');
    expect(screen.getByTestId('week-label').textContent).toBe(FORMAT.weekOfCount(2, WEEKS));
    expect(document.activeElement?.id).toBe(planRowDomId('s-4', 'ex-7'));
  });

  it('leaves no pending focus behind, so a later visit to the Plan view does not jump', () => {
    render(<Harness />);
    fireEvent.change(queryBox(), { target: { value: 'ex-3' } });
    fireEvent.keyDown(queryBox(), { key: 'Enter' });

    const row = document.getElementById(planRowDomId('s-2', 'ex-3'));
    row?.blur();
    // Re-mounting the Plan view must not re-focus: the request was consumed.
    render(<PlanView />);
    expect(document.activeElement).toBe(document.body);
  });
});

/*
 * P8 Task 16: the words come from the copy table through `useCopy()`, so `ui.skin` decides
 * them. Asserted by KEY through `copyFor`, never as a literal, so the expectation follows the
 * table instead of having to be rewritten beside it.
 */
describe('Spotlight under a skin', () => {
  it('heads the palette in the limelight words, and in the default ones under clinical', () => {
    pinSkin('limelight');
    const view = renderPalette();
    expect(screen.getByText(copyFor('limelight', 'hero.spotlight'))).toBeInTheDocument();
    // The view rows are named through their copy key too, not through the label VIEWS baked at
    // import: `nav.plan` is one of the rows the palette lists with an empty query.
    expect(optionLabels()).toContain(copyFor('limelight', 'nav.plan'));
    view.unmount();

    pinSkin('clinical');
    renderPalette();
    expect(screen.getByText(copyFor('clinical', 'hero.spotlight'))).toBeInTheDocument();
    expect(optionLabels()).toContain(copyFor('clinical', 'nav.plan'));
  });
});
